"""User model for multi-user/SaaS support."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.orm import relationship

from forge_engine.core.database import Base


class User(Base):
    """Authenticated user with plan management."""
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, nullable=False, index=True)
    username = Column(String, unique=True, nullable=True)
    hashed_password = Column(Text, nullable=False)
    plan = Column(String, default="free")           # free | pro | enterprise
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    exports_this_month = Column(Integer, default=0)
    exports_reset_at = Column(DateTime, default=datetime.utcnow)
    api_key = Column(String, nullable=True, unique=True, index=True)  # for v1.18
    webhook_url = Column(String, nullable=True)     # for v1.18
    branding_config = Column(Text, nullable=True)   # JSON for v2.0
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Plan limits
    FREE_EXPORT_LIMIT = 5   # exports/month
    PRO_EXPORT_LIMIT = None  # unlimited

    def can_export(self) -> bool:
        """Check if user can export (plan quota)."""
        if self.plan in ("pro", "enterprise"):
            return True
        # Free plan: reset counter if month changed
        now = datetime.utcnow()
        if (now.year, now.month) != (self.exports_reset_at.year, self.exports_reset_at.month):
            return True  # Reset will happen
        return self.exports_this_month < self.FREE_EXPORT_LIMIT

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "email": self.email,
            "username": self.username,
            "plan": self.plan,
            "is_active": self.is_active,
            "exports_this_month": self.exports_this_month,
            "can_export": self.can_export(),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
