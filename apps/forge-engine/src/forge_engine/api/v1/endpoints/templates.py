"""Template endpoints."""

import hashlib
import json
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from forge_engine.core.database import get_db
from forge_engine.models import Template

router = APIRouter()


class CreateTemplateRequest(BaseModel):
    name: str
    description: str | None = None
    caption_style: dict
    layout: dict
    hook_card_style: dict | None = None
    brand_kit: dict | None = None
    is_default: bool = False


class UpdateTemplateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    caption_style: dict | None = None
    layout: dict | None = None
    hook_card_style: dict | None = None
    brand_kit: dict | None = None
    is_default: bool | None = None


@router.post("")
async def create_template(
    request: CreateTemplateRequest,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Create a new template."""
    template = Template(
        name=request.name,
        description=request.description,
        caption_style=request.caption_style,
        layout=request.layout,
        hook_card_style=request.hook_card_style,
        brand_kit=request.brand_kit,
        is_default=request.is_default,
    )

    # If this is default, unset other defaults
    if request.is_default:
        await db.execute(
            Template.__table__.update().values(is_default=False)
        )

    db.add(template)
    await db.commit()
    await db.refresh(template)

    return {"success": True, "data": template.to_dict()}


@router.get("")
async def list_templates(
    db: AsyncSession = Depends(get_db)
) -> dict:
    """List all templates."""
    result = await db.execute(select(Template).order_by(Template.name))
    templates = result.scalars().all()

    return {"success": True, "data": [t.to_dict() for t in templates]}


@router.get("/{template_id}")
async def get_template(
    template_id: str,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Get a template by ID."""
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()

    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    return {"success": True, "data": template.to_dict()}


@router.put("/{template_id}")
async def update_template(
    template_id: str,
    request: UpdateTemplateRequest,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Update a template."""
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()

    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    # Update fields
    if request.name is not None:
        template.name = request.name
    if request.description is not None:
        template.description = request.description
    if request.caption_style is not None:
        template.caption_style = request.caption_style
    if request.layout is not None:
        template.layout = request.layout
    if request.hook_card_style is not None:
        template.hook_card_style = request.hook_card_style
    if request.brand_kit is not None:
        template.brand_kit = request.brand_kit
    if request.is_default is not None:
        if request.is_default:
            await db.execute(
                Template.__table__.update().values(is_default=False)
            )
        template.is_default = request.is_default

    await db.commit()
    await db.refresh(template)

    return {"success": True, "data": template.to_dict()}


@router.delete("/{template_id}")
async def delete_template(
    template_id: str,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Delete a template."""
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()

    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    await db.delete(template)
    await db.commit()

    return {"success": True, "data": {"deleted": True}}


@router.get("/{template_id}/export")
async def export_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Export a template as a portable signed JSON bundle."""
    template = await db.get(Template, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    bundle = {
        "forge_template_version": "1.0",
        "exported_at": time.time(),
        "template": {
            "name": template.name,
            "description": template.description,
            "caption_style": template.caption_style,
            "layout": template.layout,
            "hook_card_style": template.hook_card_style,
            "brand_kit": template.brand_kit,
        },
    }
    # Sign: SHA256 of the template dict (tamper detection)
    raw = json.dumps(bundle["template"], sort_keys=True).encode()
    bundle["signature"] = hashlib.sha256(raw).hexdigest()

    return bundle


@router.post("/import")
async def import_template(
    bundle: dict,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Import a template from a JSON bundle. Verifies signature before import."""
    if bundle.get("forge_template_version") != "1.0":
        raise HTTPException(status_code=400, detail="Invalid or unsupported bundle format")

    tpl_data = bundle.get("template")
    if not tpl_data:
        raise HTTPException(status_code=400, detail="Missing template data")

    # Verify signature
    expected_sig = bundle.get("signature", "")
    raw = json.dumps(tpl_data, sort_keys=True).encode()
    actual_sig = hashlib.sha256(raw).hexdigest()
    if expected_sig != actual_sig:
        raise HTTPException(status_code=400, detail="Template signature mismatch — bundle may be corrupted")

    template = Template(
        name=tpl_data.get("name", "Imported Template"),
        description=tpl_data.get("description"),
        caption_style=tpl_data.get("caption_style", {}),
        layout=tpl_data.get("layout", {}),
        hook_card_style=tpl_data.get("hook_card_style"),
        brand_kit=tpl_data.get("brand_kit"),
        is_default=False,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)

    return {"id": str(template.id), "name": template.name, "imported": True}


@router.get("/marketplace/list")
async def list_marketplace_templates() -> dict:
    """Return built-in starter templates for the marketplace."""
    starter_templates = [
        {
            "id": "starter_minimal",
            "name": "Minimal Pro",
            "description": "Sous-titres blancs clean, layout 80/20",
            "preview_emoji": "\u2b1c",
            "caption_style": {
                "font": "Inter", "fontSize": 52, "color": "#FFFFFF",
                "strokeColor": "#000000", "strokeWidth": 3,
                "position": "bottom", "style": "world_class",
            },
            "layout": {"facecam_height_pct": 0.2, "content_height_pct": 0.8},
        },
        {
            "id": "starter_fire",
            "name": "Fire Gaming",
            "description": "Sous-titres orange n\u00e9on, \u00e9nergie gaming",
            "preview_emoji": "\U0001f525",
            "caption_style": {
                "font": "Montserrat", "fontSize": 56, "color": "#FF6B00",
                "strokeColor": "#000000", "strokeWidth": 4,
                "position": "bottom", "style": "world_class",
            },
            "layout": {"facecam_height_pct": 0.25, "content_height_pct": 0.75},
        },
        {
            "id": "starter_esport",
            "name": "Esport HUD",
            "description": "Cyan/blanc, style interface de jeu",
            "preview_emoji": "\U0001f3ae",
            "caption_style": {
                "font": "SpaceGrotesk", "fontSize": 48, "color": "#00D4FF",
                "strokeColor": "#000033", "strokeWidth": 3,
                "position": "bottom", "style": "world_class",
            },
            "layout": {"facecam_height_pct": 0.3, "content_height_pct": 0.7},
        },
        {
            "id": "starter_gold",
            "name": "Gold Luxury",
            "description": "Dor\u00e9 prestige, contenu premium",
            "preview_emoji": "\u2728",
            "caption_style": {
                "font": "Montserrat", "fontSize": 52, "color": "#FFD700",
                "strokeColor": "#1A1000", "strokeWidth": 3,
                "position": "bottom", "style": "world_class",
            },
            "layout": {"facecam_height_pct": 0.22, "content_height_pct": 0.78},
        },
    ]
    return {"templates": starter_templates, "count": len(starter_templates)}


@router.post("/marketplace/{template_id}/install")
async def install_marketplace_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Install a marketplace starter template into the user's library."""
    # Get from the static list
    marketplace = await list_marketplace_templates()
    tpl_data = next((t for t in marketplace["templates"] if t["id"] == template_id), None)
    if not tpl_data:
        raise HTTPException(status_code=404, detail="Marketplace template not found")

    template = Template(
        name=tpl_data["name"],
        description=tpl_data.get("description"),
        caption_style=tpl_data.get("caption_style", {}),
        layout=tpl_data.get("layout", {}),
        is_default=False,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return {"id": str(template.id), "name": template.name, "installed": True}









