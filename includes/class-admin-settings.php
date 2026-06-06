<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AICB_Admin_Settings {

	public function __construct() {
		add_action( 'admin_menu', array( $this, 'add_admin_menu' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
	}

	public function add_admin_menu() {
		add_menu_page(
			'AI Chatbot Settings',
			'AI Chatbot',
			'manage_options',
			'aicb-settings',
			array( $this, 'render_settings_page' ),
			'dashicons-format-chat',
			100
		);

		add_submenu_page(
			'aicb-settings',
			'Settings',
			'Settings',
			'manage_options',
			'aicb-settings',
			array( $this, 'render_settings_page' )
		);

		add_submenu_page(
			'aicb-settings',
			'Chat Logs',
			'Chat Logs',
			'manage_options',
			'aicb-logs',
			array( $this, 'render_chat_logs_page' )
		);
	}

	public function register_settings() {
		register_setting( 'aicb_settings_group', 'aicb_api_provider', 'sanitize_text_field' );
		register_setting( 'aicb_settings_group', 'aicb_api_key', 'sanitize_text_field' );
		register_setting( 'aicb_settings_group', 'aicb_api_model', 'sanitize_text_field' );
		register_setting( 'aicb_settings_group', 'aicb_company_info', 'wp_kses_post' );
		register_setting( 'aicb_settings_group', 'aicb_rate_limit', 'absint' );
		register_setting( 'aicb_settings_group', 'aicb_bot_name', 'sanitize_text_field' );
		register_setting( 'aicb_settings_group', 'aicb_welcome_message', 'sanitize_text_field' );
	}

	public function render_settings_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		if ( isset( $_GET['settings-updated'] ) ) {
			add_settings_error( 'aicb_messages', 'aicb_message', __( 'Settings Saved', 'aicb' ), 'updated' );
		}

		settings_errors( 'aicb_messages' );
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'AI Chatbot Settings', 'aicb' ); ?></h1>
			<form action="options.php" method="post">
				<?php
				settings_fields( 'aicb_settings_group' );
				do_settings_sections( 'aicb_settings_group' );
				?>
				<table class="form-table">
					<tr>
						<th scope="row"><label for="aicb_api_provider">API Provider</label></th>
						<td>
							<select id="aicb_api_provider" name="aicb_api_provider">
								<option value="openai" <?php selected( get_option( 'aicb_api_provider', 'openai' ), 'openai' ); ?>>OpenAI</option>
								<option value="groq" <?php selected( get_option( 'aicb_api_provider' ), 'groq' ); ?>>Groq</option>
								<option value="gemini" <?php selected( get_option( 'aicb_api_provider' ), 'gemini' ); ?>>Google Gemini</option>
							</select>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="aicb_api_key">API Key</label></th>
						<td>
							<input type="password" id="aicb_api_key" name="aicb_api_key" value="<?php echo esc_attr( get_option( 'aicb_api_key' ) ); ?>" class="regular-text" />
							<p class="description">Your API Key for the selected provider.</p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="aicb_api_model">AI Model</label></th>
						<td>
							<input type="text" id="aicb_api_model" name="aicb_api_model" value="<?php echo esc_attr( get_option( 'aicb_api_model', 'gpt-4o-mini' ) ); ?>" class="regular-text" />
							<p class="description">Type the exact model name. e.g., <code>gpt-4o-mini</code> (OpenAI), <code>llama3-8b-8192</code> (Groq), <code>gemini-1.5-flash</code> (Gemini).</p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="aicb_bot_name">Bot Name</label></th>
						<td>
							<input type="text" id="aicb_bot_name" name="aicb_bot_name" value="<?php echo esc_attr( get_option( 'aicb_bot_name', 'AI Assistant' ) ); ?>" class="regular-text" />
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="aicb_welcome_message">Welcome Message</label></th>
						<td>
							<input type="text" id="aicb_welcome_message" name="aicb_welcome_message" value="<?php echo esc_attr( get_option( 'aicb_welcome_message', "Bonjour ! 👋 Comment puis-je vous aider aujourd'hui ?" ) ); ?>" class="regular-text" />
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="aicb_rate_limit">Rate Limit</label></th>
						<td>
							<input type="number" id="aicb_rate_limit" name="aicb_rate_limit" value="<?php echo esc_attr( get_option( 'aicb_rate_limit', 30 ) ); ?>" class="small-text" />
							<p class="description">Max messages per hour per IP address.</p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="aicb_company_info">Company Info</label></th>
						<td>
							<textarea id="aicb_company_info" name="aicb_company_info" rows="20" cols="80" class="large-text code"><?php echo esc_textarea( get_option( 'aicb_company_info' ) ); ?></textarea>
							<p class="description">Enter all your company information here (up to ~10,000 characters). The AI will use this to answer questions.</p>
						</td>
					</tr>
				</table>
				<?php submit_button( 'Save Settings' ); ?>
			</form>
		</div>
		<?php
	}

	public function render_chat_logs_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$page = isset( $_GET['paged'] ) ? max( 1, intval( $_GET['paged'] ) ) : 1;
		$sessions = AICB_DB_Manager::get_all_sessions( $page, 20 );

		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'Chat Logs', 'aicb' ); ?></h1>
			
			<table class="wp-list-table widefat fixed striped">
				<thead>
					<tr>
						<th>Session ID</th>
						<th>IP Address</th>
						<th>Messages</th>
						<th>Summary</th>
						<th>Last Active</th>
					</tr>
				</thead>
				<tbody>
					<?php if ( empty( $sessions ) ) : ?>
						<tr><td colspan="5">No chat sessions found.</td></tr>
					<?php else : ?>
						<?php foreach ( $sessions as $session ) : ?>
							<tr>
								<td><?php echo esc_html( substr( $session->session_id, 0, 8 ) . '...' ); ?></td>
								<td><?php echo esc_html( $session->ip_address ); ?></td>
								<td><?php echo esc_html( $session->message_count ); ?></td>
								<td><?php echo esc_html( wp_trim_words( $session->summary, 20 ) ); ?></td>
								<td><?php echo esc_html( $session->updated_at ); ?></td>
							</tr>
						<?php endforeach; ?>
					<?php endif; ?>
				</tbody>
			</table>
		</div>
		<?php
	}
}
