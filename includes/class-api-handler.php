<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AICB_API_Handler {

	public function __construct() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	public function register_routes() {
		register_rest_route( 'aicb/v1', '/chat', array(
			'methods'             => 'POST',
			'callback'            => array( $this, 'handle_chat' ),
			'permission_callback' => '__return_true',
		) );
	}

	private function get_client_ip() {
		$ipaddress = '';
		if ( isset( $_SERVER['HTTP_CLIENT_IP'] ) )
			$ipaddress = $_SERVER['HTTP_CLIENT_IP'];
		else if ( isset( $_SERVER['HTTP_X_FORWARDED_FOR'] ) )
			$ipaddress = $_SERVER['HTTP_X_FORWARDED_FOR'];
		else if ( isset( $_SERVER['HTTP_X_FORWARDED'] ) )
			$ipaddress = $_SERVER['HTTP_X_FORWARDED'];
		else if ( isset( $_SERVER['HTTP_FORWARDED_FOR'] ) )
			$ipaddress = $_SERVER['HTTP_FORWARDED_FOR'];
		else if ( isset( $_SERVER['HTTP_FORWARDED'] ) )
			$ipaddress = $_SERVER['HTTP_FORWARDED'];
		else if ( isset( $_SERVER['REMOTE_ADDR'] ) )
			$ipaddress = $_SERVER['REMOTE_ADDR'];
		else
			$ipaddress = 'UNKNOWN';
		return $ipaddress;
	}

	public function handle_chat( WP_REST_Request $request ) {
		$params = $request->get_json_params();
		
		$message = isset( $params['message'] ) ? sanitize_text_field( $params['message'] ) : '';
		$session_id = isset( $params['session_id'] ) ? sanitize_text_field( $params['session_id'] ) : '';

		if ( empty( $message ) || empty( $session_id ) ) {
			return new WP_Error( 'invalid_params', 'Message and Session ID are required.', array( 'status' => 400 ) );
		}

		// Enforce char limit
		$message = substr( $message, 0, 500 );

		$ip_address = $this->get_client_ip();
		$max_rate = get_option( 'aicb_rate_limit', 30 );

		if ( ! AICB_DB_Manager::check_rate_limit( $ip_address, $max_rate ) ) {
			return new WP_Error( 'rate_limited', 'Rate limit exceeded. Please try again later.', array( 'status' => 429 ) );
		}

		$session = AICB_DB_Manager::get_or_create_session( $session_id, $ip_address );
		AICB_DB_Manager::save_message( $session_id, 'user', $message );

		$api_key = get_option( 'aicb_api_key', '' );
		if ( empty( $api_key ) ) {
			return new WP_Error( 'no_api_key', 'API key not configured.', array( 'status' => 500 ) );
		}

		$messages_array = array();
		
		$company_info = get_option( 'aicb_company_info', '' );
		$system_content = "You are a helpful customer service assistant for our company. Answer questions based on the company information provided below. Be friendly, concise, and professional. If you don't know the answer, say so politely and suggest contacting the company directly.\n\nCOMPANY INFO:\n" . wp_strip_all_tags( $company_info );

		if ( ! empty( $session->summary ) ) {
			$system_content .= "\n\nPrevious conversation summary: " . $session->summary;
		}

		$messages_array[] = array(
			'role'    => 'system',
			'content' => $system_content,
		);

		$recent_messages = AICB_DB_Manager::get_recent_messages( $session_id, 6 );
		foreach ( $recent_messages as $msg ) {
			$messages_array[] = array(
				'role'    => $msg->role,
				'content' => $msg->content,
			);
		}

		// Add current message
		$messages_array[] = array(
			'role'    => 'user',
			'content' => $message,
		);

		// Streaming Headers
		header('Content-Type: text/event-stream');
		header('Cache-Control: no-cache');
		header('Connection: keep-alive');
		header('X-Accel-Buffering: no');
		
		while (ob_get_level() > 0) {
			ob_end_clean();
		}

		$api_model = get_option( 'aicb_api_model', 'gpt-4o-mini' );

		$post_data = array(
			'model'       => $api_model,
			'messages'    => $messages_array,
			'stream'      => true,
			'temperature' => 0.7,
		);

		$full_response_text = '';

		$ch = curl_init( 'https://api.openai.com/v1/chat/completions' );
		curl_setopt( $ch, CURLOPT_HTTPHEADER, array(
			'Content-Type: application/json',
			'Authorization: Bearer ' . $api_key
		));
		curl_setopt( $ch, CURLOPT_POST, 1 );
		curl_setopt( $ch, CURLOPT_POSTFIELDS, json_encode( $post_data ) );
		curl_setopt( $ch, CURLOPT_RETURNTRANSFER, 0 ); 
		
		curl_setopt( $ch, CURLOPT_WRITEFUNCTION, function( $curl, $data ) use ( &$full_response_text ) {
			$lines = explode( "\n", $data );
			foreach ( $lines as $line ) {
				$line = trim( $line );
				if ( strpos( $line, 'data: ' ) === 0 ) {
					$json_string = substr( $line, 6 );
					if ( $json_string === '[DONE]' ) {
						continue;
					}
					
					$json_data = json_decode( $json_string, true );
					if ( isset( $json_data['choices'][0]['delta']['content'] ) ) {
						$content = $json_data['choices'][0]['delta']['content'];
						$full_response_text .= $content;
						
						echo "data: " . json_encode( array( 'content' => $content ) ) . "\n\n";
						ob_flush();
						flush();
					}
				}
			}
			return strlen( $data );
		});

		curl_exec( $ch );
		$http_code = curl_getinfo( $ch, CURLINFO_HTTP_CODE );
		curl_close( $ch );

		if ( $http_code >= 400 ) {
			$error_msg = "I apologize, but I'm experiencing technical difficulties. Please try again in a moment.";
			echo "data: " . json_encode( array( 'content' => $error_msg ) ) . "\n\n";
			ob_flush();
			flush();
			$full_response_text = $error_msg;
		}

		echo "data: [DONE]\n\n";
		ob_flush();
		flush();

		AICB_DB_Manager::save_message( $session_id, 'assistant', $full_response_text );

		$session = AICB_DB_Manager::get_or_create_session( $session_id, $ip_address );
		if ( $session->message_count % 4 === 0 && $session->message_count > 0 ) {
			$this->generate_summary( $session_id, $session->summary, $recent_messages, $api_key, $api_model );
		}

		exit; // Stop WP execution after streaming
	}

	private function generate_summary( $session_id, $old_summary, $recent_messages, $api_key, $api_model ) {
		$transcript = '';
		foreach ( $recent_messages as $msg ) {
			$role = $msg->role === 'user' ? 'User' : 'Assistant';
			$transcript .= "{$role}: {$msg->content}\n";
		}

		$prompt = "Summarize this conversation in 2-3 sentences, focusing on the user intent and key topics discussed.\n\nOld Summary:\n" . $old_summary . "\n\nRecent Transcript:\n" . $transcript;

		$post_data = array(
			'model'       => $api_model,
			'messages'    => array(
				array( 'role' => 'user', 'content' => $prompt )
			),
			'stream'      => false,
		);

		$response = wp_remote_post( 'https://api.openai.com/v1/chat/completions', array(
			'headers' => array(
				'Content-Type'  => 'application/json',
				'Authorization' => 'Bearer ' . $api_key,
			),
			'body'    => json_encode( $post_data ),
			'timeout' => 15,
		) );

		if ( ! is_wp_error( $response ) ) {
			$body = json_decode( wp_remote_retrieve_body( $response ), true );
			if ( isset( $body['choices'][0]['message']['content'] ) ) {
				$new_summary = trim( $body['choices'][0]['message']['content'] );
				AICB_DB_Manager::update_summary( $session_id, $new_summary );
			}
		}
	}
}
