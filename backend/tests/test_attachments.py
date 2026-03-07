# tests/test_attachments.py — Attachment system tests
import pytest
import io
from httpx import AsyncClient

from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_get_supported_categories(client: AsyncClient, test_user):
    """Get supported file categories"""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/attachments/categories/supported", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "categories" in data
    assert "image" in data["categories"]
    assert "document" in data["categories"]
    assert "blocked_extensions" in data


@pytest.mark.asyncio
async def test_upload_single_file(client: AsyncClient, test_user):
    """Upload a single image file"""
    headers = get_auth_headers(test_user)
    png_header = b'\x89PNG\r\n\x1a\n' + b'\x00' * 100
    resp = await client.post(
        "/api/v1/attachments/upload",
        headers=headers,
        files={"file": ("test_image.png", io.BytesIO(png_header), "image/png")},
    )
    assert resp.status_code == 201
    data = resp.json()
    # Filename may have UUID prefix
    assert "test_image.png" in data["filename"]
    assert data["content_type"] == "image/png"
    assert data["category"] == "image"
    assert "id" in data
    assert "checksum_sha256" in data


@pytest.mark.asyncio
async def test_upload_blocked_extension(client: AsyncClient, test_user):
    """Blocked file extensions should be rejected"""
    headers = get_auth_headers(test_user)
    resp = await client.post(
        "/api/v1/attachments/upload",
        headers=headers,
        files={"file": ("malware.exe", io.BytesIO(b"MZ" + b"\x00" * 50), "application/octet-stream")},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_upload_small_file_succeeds(client: AsyncClient, test_user):
    """Small files within size limit should succeed"""
    headers = get_auth_headers(test_user)
    small_file = b"\x89PNG\r\n\x1a\n" + b"\x00" * 50
    resp = await client.post(
        "/api/v1/attachments/upload",
        headers=headers,
        files={"file": ("small.png", io.BytesIO(small_file), "image/png")},
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_get_attachment(client: AsyncClient, test_user):
    """Get attachment by ID"""
    headers = get_auth_headers(test_user)
    png_data = b'\x89PNG\r\n\x1a\n' + b'\x00' * 100
    upload_resp = await client.post(
        "/api/v1/attachments/upload",
        headers=headers,
        files={"file": ("get_test.png", io.BytesIO(png_data), "image/png")},
    )
    assert upload_resp.status_code == 201
    attachment_id = upload_resp.json()["id"]

    resp = await client.get(f"/api/v1/attachments/{attachment_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == attachment_id
    assert "get_test.png" in data["filename"]


@pytest.mark.asyncio
async def test_get_attachment_not_found(client: AsyncClient, test_user):
    """Non-existent attachment returns 404"""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/attachments/nonexistent-id", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_attachments(client: AsyncClient, test_user):
    """List all attachments"""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/attachments/", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data


@pytest.mark.asyncio
async def test_update_attachment(client: AsyncClient, test_user):
    """Update attachment metadata"""
    headers = get_auth_headers(test_user)
    png_data = b'\x89PNG\r\n\x1a\n' + b'\x00' * 100
    upload_resp = await client.post(
        "/api/v1/attachments/upload",
        headers=headers,
        files={"file": ("update_test.png", io.BytesIO(png_data), "image/png")},
    )
    assert upload_resp.status_code == 201
    attachment_id = upload_resp.json()["id"]

    resp = await client.patch(
        f"/api/v1/attachments/{attachment_id}",
        headers=headers,
        json={"description": "Updated description", "tags": ["test", "updated"]},
    )
    assert resp.status_code == 200
    data = resp.json()
    # Verify tags were updated
    assert "test" in data.get("tags", []) or "updated" in data.get("tags", [])


@pytest.mark.asyncio
async def test_delete_attachment(client: AsyncClient, test_user):
    """Delete an attachment"""
    headers = get_auth_headers(test_user)
    png_data = b'\x89PNG\r\n\x1a\n' + b'\x00' * 100
    upload_resp = await client.post(
        "/api/v1/attachments/upload",
        headers=headers,
        files={"file": ("delete_test.png", io.BytesIO(png_data), "image/png")},
    )
    assert upload_resp.status_code == 201
    attachment_id = upload_resp.json()["id"]

    resp = await client.delete(f"/api/v1/attachments/{attachment_id}", headers=headers)
    assert resp.status_code == 204

    resp2 = await client.get(f"/api/v1/attachments/{attachment_id}", headers=headers)
    assert resp2.status_code == 404


@pytest.mark.asyncio
async def test_upload_document(client: AsyncClient, test_user):
    """Upload a document file"""
    headers = get_auth_headers(test_user)
    pdf_data = b"%PDF-1.4" + b"\x00" * 100
    resp = await client.post(
        "/api/v1/attachments/upload",
        headers=headers,
        files={"file": ("report.pdf", io.BytesIO(pdf_data), "application/pdf")},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "report.pdf" in data["filename"]
    assert data["category"] == "document"


@pytest.mark.asyncio
async def test_upload_stats(client: AsyncClient, test_user):
    """Get upload statistics"""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/attachments/stats/overview", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "by_category" in data


@pytest.mark.asyncio
async def test_scan_result(client: AsyncClient, test_user):
    """Get virus scan result for an attachment"""
    headers = get_auth_headers(test_user)
    png_data = b'\x89PNG\r\n\x1a\n' + b'\x00' * 100
    upload_resp = await client.post(
        "/api/v1/attachments/upload",
        headers=headers,
        files={"file": ("scan_test.png", io.BytesIO(png_data), "image/png")},
    )
    assert upload_resp.status_code == 201
    attachment_id = upload_resp.json()["id"]

    resp = await client.get(f"/api/v1/attachments/{attachment_id}/scan", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data


@pytest.mark.asyncio
async def test_batch_upload(client: AsyncClient, test_user):
    """Batch upload multiple files"""
    headers = get_auth_headers(test_user)
    files = [
        ("files", ("file1.png", io.BytesIO(b'\x89PNG\r\n\x1a\n' + b'\x00' * 50), "image/png")),
        ("files", ("file2.png", io.BytesIO(b'\x89PNG\r\n\x1a\n' + b'\x00' * 50), "image/png")),
    ]
    resp = await client.post(
        "/api/v1/attachments/upload/batch",
        headers=headers,
        files=files,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "uploaded" in data or "successful" in data or "results" in data