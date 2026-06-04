<?php
/**
 * Database Manager for AI Chatbot.
 *
 * Handles all custom table creation and database operations
 * for chat sessions and messages.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AICB_DB_Manager {

	/**
	 * Create custom database tables using dbDelta.
	 *
	 * Creates aicb_sessions and aicb_messages tables.
	 */
	public static function create_tables() {
		global $wpdb;

		$charset_collate = $wpdb->get_charset_collate();
		$sessions_table  = $wpdb->prefix . 'aicb_sessions';
		$messages_table  = $wpdb->prefix . 'aicb_messages';

		$sql_sessions = "CREATE TABLE {$sessions_table} (
			id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
			session_id VARCHAR(64) NOT NULL,
			ip_address VARCHAR(45) NOT NULL,
			summary TEXT DEFAULT '',
			message_count INT(11) DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			PRIMARY KEY  (id),
			UNIQUE KEY session_id (session_id)
		) {$charset_collate};";

		$sql_messages = "CREATE TABLE {$messages_table} (
			id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
			session_id VARCHAR(64) NOT NULL,
			role ENUM('user','assistant') NOT NULL,
			content TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY  (id),
			KEY session_id (session_id)
		) {$charset_collate};";

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		dbDelta( $sql_sessions );
		dbDelta( $sql_messages );
	}

	/**
	 * Get an existing session or create a new one.
	 *
	 * @param string $session_id  The UUID session identifier from the frontend.
	 * @param string $ip_address  The visitor's IP address.
	 * @return object|null The session row.
	 */
	public static function get_or_create_session( $session_id, $ip_address ) {
		global $wpdb;

		$table   = $wpdb->prefix . 'aicb_sessions';
		$session = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT * FROM {$table} WHERE session_id = %s",
				$session_id
			)
		);

		if ( $session ) {
			return $session;
		}

		$wpdb->insert(
			$table,
			array(
				'session_id' => $session_id,
				'ip_address' => $ip_address,
			),
			array( '%s', '%s' )
		);

		return $wpdb->get_row(
			$wpdb->prepare(
				"SELECT * FROM {$table} WHERE session_id = %s",
				$session_id
			)
		);
	}

	/**
	 * Get the most recent messages for a session.
	 *
	 * Returns messages ordered oldest-first so the conversation
	 * reads naturally when passed to the AI context.
	 *
	 * @param string $session_id The session identifier.
	 * @param int    $limit      Maximum number of messages to return.
	 * @return array Array of message rows.
	 */
	public static function get_recent_messages( $session_id, $limit = 6 ) {
		global $wpdb;

		$table = $wpdb->prefix . 'aicb_messages';

		// Subquery grabs the latest N message IDs, outer query re-orders ASC.
		return $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$table}
				WHERE id IN (
					SELECT id FROM (
						SELECT id FROM {$table}
						WHERE session_id = %s
						ORDER BY created_at DESC
						LIMIT %d
					) AS recent
				)
				ORDER BY created_at ASC",
				$session_id,
				$limit
			)
		);
	}

	/**
	 * Save a new message and enforce the sliding window.
	 *
	 * After inserting, if the session has more than 12 messages (6 pairs),
	 * the oldest messages beyond 12 are deleted to keep the window lean.
	 * Also increments the session's message_count.
	 *
	 * @param string $session_id The session identifier.
	 * @param string $role       Either 'user' or 'assistant'.
	 * @param string $content    The message content.
	 * @return int|false The inserted message ID, or false on failure.
	 */
	public static function save_message( $session_id, $role, $content ) {
		global $wpdb;

		$messages_table = $wpdb->prefix . 'aicb_messages';
		$sessions_table = $wpdb->prefix . 'aicb_sessions';

		// Insert the new message.
		$inserted = $wpdb->insert(
			$messages_table,
			array(
				'session_id' => $session_id,
				'role'       => $role,
				'content'    => $content,
			),
			array( '%s', '%s', '%s' )
		);

		if ( false === $inserted ) {
			return false;
		}

		$insert_id = $wpdb->insert_id;

		// Count total messages for this session.
		$total = (int) $wpdb->get_var(
			$wpdb->prepare(
				"SELECT COUNT(*) FROM {$messages_table} WHERE session_id = %s",
				$session_id
			)
		);

		// If over 12 messages, delete the oldest to keep only 12.
		if ( $total > 12 ) {
			$excess = $total - 12;
			$wpdb->query(
				$wpdb->prepare(
					"DELETE FROM {$messages_table}
					WHERE session_id = %s
					ORDER BY created_at ASC
					LIMIT %d",
					$session_id,
					$excess
				)
			);
		}

		// Increment the session's message_count.
		$wpdb->query(
			$wpdb->prepare(
				"UPDATE {$sessions_table}
				SET message_count = message_count + 1
				WHERE session_id = %s",
				$session_id
			)
		);

		return $insert_id;
	}

	/**
	 * Update the conversation summary for a session.
	 *
	 * @param string $session_id The session identifier.
	 * @param string $summary    The updated summary text.
	 * @return int|false The number of rows updated, or false on error.
	 */
	public static function update_summary( $session_id, $summary ) {
		global $wpdb;

		$table = $wpdb->prefix . 'aicb_sessions';

		return $wpdb->update(
			$table,
			array( 'summary' => $summary ),
			array( 'session_id' => $session_id ),
			array( '%s' ),
			array( '%s' )
		);
	}

	/**
	 * Check if an IP address is within the rate limit.
	 *
	 * Counts messages sent from this IP across ALL sessions
	 * in the last 60 minutes.
	 *
	 * @param string $ip_address   The visitor's IP address.
	 * @param int    $max_per_hour Maximum allowed messages per hour.
	 * @return bool True if under the limit, false if over.
	 */
	public static function check_rate_limit( $ip_address, $max_per_hour = 30 ) {
		global $wpdb;

		$messages_table = $wpdb->prefix . 'aicb_messages';
		$sessions_table = $wpdb->prefix . 'aicb_sessions';

		$count = (int) $wpdb->get_var(
			$wpdb->prepare(
				"SELECT COUNT(*) FROM {$messages_table} m
				INNER JOIN {$sessions_table} s ON m.session_id = s.session_id
				WHERE s.ip_address = %s
				  AND m.role = 'user'
				  AND m.created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)",
				$ip_address
			)
		);

		return $count < $max_per_hour;
	}

	/**
	 * Delete sessions and messages older than a given number of days.
	 *
	 * Deletes messages first (child rows), then sessions.
	 *
	 * @param int $days Number of days. Sessions older than this are deleted.
	 */
	public static function cleanup_old_sessions( $days = 30 ) {
		global $wpdb;

		$messages_table = $wpdb->prefix . 'aicb_messages';
		$sessions_table = $wpdb->prefix . 'aicb_sessions';

		// Delete messages belonging to old sessions.
		$wpdb->query(
			$wpdb->prepare(
				"DELETE m FROM {$messages_table} m
				INNER JOIN {$sessions_table} s ON m.session_id = s.session_id
				WHERE s.created_at < DATE_SUB(NOW(), INTERVAL %d DAY)",
				$days
			)
		);

		// Delete old sessions.
		$wpdb->query(
			$wpdb->prepare(
				"DELETE FROM {$sessions_table}
				WHERE created_at < DATE_SUB(NOW(), INTERVAL %d DAY)",
				$days
			)
		);
	}

	/**
	 * Get paginated sessions for the admin dashboard.
	 *
	 * @param int $page     Current page number (1-based).
	 * @param int $per_page Number of sessions per page.
	 * @return array {
	 *     @type array  $sessions Array of session rows.
	 *     @type int    $total    Total number of sessions.
	 *     @type int    $pages    Total number of pages.
	 * }
	 */
	public static function get_all_sessions( $page = 1, $per_page = 20 ) {
		global $wpdb;

		$table  = $wpdb->prefix . 'aicb_sessions';
		$offset = ( $page - 1 ) * $per_page;

		$total = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" );

		$sessions = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$table}
				ORDER BY updated_at DESC
				LIMIT %d OFFSET %d",
				$per_page,
				$offset
			)
		);

		return array(
			'sessions' => $sessions,
			'total'    => $total,
			'pages'    => (int) ceil( $total / $per_page ),
		);
	}

	/**
	 * Get all messages for a given session.
	 *
	 * Used by the admin log viewer to display the full conversation.
	 *
	 * @param string $session_id The session identifier.
	 * @return array Array of message rows ordered by creation time.
	 */
	public static function get_session_messages( $session_id ) {
		global $wpdb;

		$table = $wpdb->prefix . 'aicb_messages';

		return $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$table}
				WHERE session_id = %s
				ORDER BY created_at ASC",
				$session_id
			)
		);
	}
}
