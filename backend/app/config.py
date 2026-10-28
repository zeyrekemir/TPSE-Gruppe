from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo

from pydantic_settings import BaseSettings, SettingsConfigDict

# The lab's local time: statistics count lab days in it, notifications show times in it.
LAB_TZ = ZoneInfo("Europe/Berlin")


class Settings(BaseSettings):
    """Application settings, read from environment variables (prefix ROBOTS_) or a .env file."""

    # backend/.env is found wherever the server is started from; a .env in the working directory wins.
    model_config = SettingsConfigDict(
        env_prefix="ROBOTS_", env_file=(Path(__file__).resolve().parent.parent / ".env", ".env"), extra="ignore"
    )

    # Development default: SQLite file next to the backend folder, independent of the working directory.
    database_url: str = f"sqlite:///{(Path(__file__).resolve().parent.parent / 'robots.db').as_posix()}"
    # Apply database migrations (Alembic) on startup.
    auto_migrate: bool = True
    secret_key: str = "change-me-in-production"
    access_token_minutes: int = 60 * 12
    cors_origins: list[str] = ["http://localhost:5173"]
    # Where users open the app; used for links in notifications and the SSO redirect.
    public_url: str = "http://localhost:5173"

    # Initial admin, created on startup if no user exists yet.
    bootstrap_admin_username: str | None = "admin"
    bootstrap_admin_password: str | None = "admin"

    # LDAP. Leave ldap_url empty to use local accounts only.
    ldap_url: str | None = None
    ldap_user_dn_template: str = "uid={username},ou=people,dc=example,dc=org"
    ldap_admin_group_dn: str | None = None
    ldap_email_attribute: str = "mail"
    ldap_name_attribute: str = "cn"

    # Single sign-on via OpenID Connect (e.g. TU-ID). Leave oidc_issuer empty to disable.
    oidc_issuer: str | None = None
    oidc_client_id: str | None = None
    oidc_client_secret: str | None = None
    oidc_scopes: str = "openid profile email"
    oidc_username_claim: str = "preferred_username"
    oidc_groups_claim: str = "groups"
    oidc_admin_group: str | None = None
    # Comma-separated usernames (TU-IDs) that always become admins; TU-ID itself sends no groups.
    oidc_admin_users: str = ""
    # How the hub authenticates at the token endpoint: client_secret_basic (OIDC default) or client_secret_post.
    oidc_token_auth: str = "client_secret_basic"
    oidc_button_label: str = "TU-ID"

    # Notifications. Each channel is off while its settings are empty.
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str = "robots@localhost"
    smtp_starttls: bool = True
    # Implicit TLS from the first byte (port 465, e.g. smtp.tu-darmstadt.de) instead of STARTTLS.
    smtp_ssl: bool = False
    discord_webhook_url: str | None = None
    discord_language: str = "de"  # the Discord channel is shared, so it gets one language: de or en
    reminder_minutes: int = 30  # e-mail reminder before a reservation starts; 0 = off

    # Booking rules for members (admins are exempt). 0 = no limit.
    max_reservation_hours: float = 0
    max_advance_days: int = 0

    # Live status: a robot counts as online if its last heartbeat is newer than this.
    live_timeout_seconds: int = 90

    @property
    def oidc_admin_user_list(self) -> list[str]:
        return [u.strip().lower() for u in self.oidc_admin_users.split(",") if u.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
