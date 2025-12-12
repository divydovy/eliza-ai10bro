# DEPRECATED - DO NOT USE

This script is from the OLD implementation where WordPress was a post-processor.
The NEW implementation treats WordPress as a first-class client in the broadcast system.

Use the main broadcast system instead:
1. process-unprocessed-docs.js generates WordPress broadcasts
2. send-pending-to-wordpress.js publishes them

See WORDPRESS_CLIENT_ARCHITECTURE.md for details.

