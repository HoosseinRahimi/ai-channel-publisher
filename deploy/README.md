# =============================================================================
# VerborgeneSchicht Publisher — deployment assets
#
#   deploy/nginx.conf          Nginx TLS reverse proxy (Ubuntu/Debian layout)
#   deploy/caddy/Caddyfile     Caddy 2 reverse proxy (automatic HTTPS)
#
# Both terminate TLS and forward to the app on :3000. The scheduler (whether
# the in-process cron scheduler) needs the app reachable on a
# public HTTPS URL.
# =============================================================================
