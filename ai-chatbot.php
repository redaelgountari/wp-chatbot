<?php
/**
 * Plugin Name: AI Chatbot
 * Description: An AI-powered chatbot that answers visitor questions using your company info.
 * Version: 1.0.4
 * Author: AI Chatbot
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'AICB_VERSION', '1.0.4' );
define( 'AICB_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'AICB_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

// Include class files.
require_once AICB_PLUGIN_DIR . 'includes/class-db-manager.php';
require_once AICB_PLUGIN_DIR . 'includes/class-api-handler.php';
require_once AICB_PLUGIN_DIR . 'includes/class-admin-settings.php';

/**
 * Plugin activation callback.
 *
 * Creates custom database tables and schedules the daily cleanup cron event.
 */
function aicb_activate() {
	AICB_DB_Manager::create_tables();

	if ( ! wp_next_scheduled( 'aicb_daily_cleanup' ) ) {
		wp_schedule_event( time(), 'daily', 'aicb_daily_cleanup' );
	}
}
register_activation_hook( __FILE__, 'aicb_activate' );

/**
 * Plugin deactivation callback.
 *
 * Clears the daily cleanup cron schedule.
 */
function aicb_deactivate() {
	$timestamp = wp_next_scheduled( 'aicb_daily_cleanup' );
	if ( $timestamp ) {
		wp_unschedule_event( $timestamp, 'aicb_daily_cleanup' );
	}
}
register_deactivation_hook( __FILE__, 'aicb_deactivate' );

/**
 * Daily cleanup cron handler.
 *
 * Deletes sessions and messages older than 30 days.
 */
add_action( 'aicb_daily_cleanup', function () {
	AICB_DB_Manager::cleanup_old_sessions( 30 );
} );

/**
 * Enqueue frontend chatbot assets.
 */
function aicb_enqueue_frontend_assets() {
	wp_enqueue_style(
		'aicb-chatbot',
		AICB_PLUGIN_URL . 'assets/css/chatbot.css',
		array(),
		AICB_VERSION
	);

	wp_enqueue_script(
		'aicb-chatbot',
		AICB_PLUGIN_URL . 'assets/js/chatbot.js',
		array(),
		AICB_VERSION,
		true // Load in footer.
	);

	// Add defer attribute.
	add_filter( 'script_loader_tag', function ( $tag, $handle ) {
		if ( 'aicb-chatbot' === $handle ) {
			return str_replace( ' src', ' defer src', $tag );
		}
		return $tag;
	}, 10, 2 );

	wp_localize_script( 'aicb-chatbot', 'aicb_ajax', array(
		'rest_url'        => rest_url( 'aicb/v1/chat' ),
		'nonce'           => wp_create_nonce( 'wp_rest' ),
		'bot_name'        => get_option( 'aicb_bot_name', 'AI Assistant' ),
		'welcome_message' => get_option( 'aicb_welcome_message', "Bonjour ! 👋 Comment puis-je vous aider aujourd'hui ?" ),
	) );
}
add_action( 'wp_enqueue_scripts', 'aicb_enqueue_frontend_assets' );

/**
 * Initialize plugin components.
 */
function aicb_init() {
	new AICB_Admin_Settings();
	new AICB_API_Handler();
}
add_action( 'init', 'aicb_init' );
