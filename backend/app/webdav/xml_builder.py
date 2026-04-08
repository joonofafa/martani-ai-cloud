"""DAV XML response generation using lxml."""

import hashlib
from datetime import datetime
from lxml import etree

from app.models.file import File as FileModel

DAV_NS = "DAV:"
OC_NS = "http://owncloud.org/ns"

NSMAP = {
    "d": DAV_NS,
    "oc": OC_NS,
}


def build_multistatus(responses: list[etree._Element]) -> bytes:
    """Wrap response elements in a d:multistatus root."""
    root = etree.Element(f"{{{DAV_NS}}}multistatus", nsmap=NSMAP)
    for resp in responses:
        root.append(resp)
    return etree.tostring(root, xml_declaration=True, encoding="UTF-8")


def build_response_element(
    href: str,
    file_record: FileModel | None,
    is_folder: bool,
    is_root: bool = False,
) -> etree._Element:
    """Build a single d:response element for a file or folder."""
    response = etree.Element(f"{{{DAV_NS}}}response")

    # d:href
    href_el = etree.SubElement(response, f"{{{DAV_NS}}}href")
    href_el.text = href

    # d:propstat
    propstat = etree.SubElement(response, f"{{{DAV_NS}}}propstat")
    prop = etree.SubElement(propstat, f"{{{DAV_NS}}}prop")

    # d:resourcetype
    resourcetype = etree.SubElement(prop, f"{{{DAV_NS}}}resourcetype")
    if is_folder:
        etree.SubElement(resourcetype, f"{{{DAV_NS}}}collection")

    if is_folder:
        etree.SubElement(prop, f"{{{DAV_NS}}}getcontentlength").text = "0"
    else:
        if file_record:
            etree.SubElement(prop, f"{{{DAV_NS}}}getcontentlength").text = str(file_record.size)
            etree.SubElement(prop, f"{{{DAV_NS}}}getcontenttype").text = (
                file_record.mime_type or "application/octet-stream"
            )

    if file_record:
        # d:getlastmodified
        etree.SubElement(prop, f"{{{DAV_NS}}}getlastmodified").text = (
            file_record.updated_at.strftime("%a, %d %b %Y %H:%M:%S GMT")
        )

        # d:getetag
        etag = generate_etag(file_record)
        etree.SubElement(prop, f"{{{DAV_NS}}}getetag").text = f'"{etag}"'

        # oc:fileid
        etree.SubElement(prop, f"{{{OC_NS}}}fileid").text = str(file_record.id)

        # oc:size
        etree.SubElement(prop, f"{{{OC_NS}}}size").text = str(file_record.size)

        # oc:permissions (R=read, W=write, D=delete, N=rename, V=move, C=create)
        etree.SubElement(prop, f"{{{OC_NS}}}permissions").text = "RDNVCK" if is_folder else "RDNVW"

        # d:displayname
        etree.SubElement(prop, f"{{{DAV_NS}}}displayname").text = file_record.original_filename

    elif is_root:
        etree.SubElement(prop, f"{{{DAV_NS}}}getlastmodified").text = (
            datetime.utcnow().strftime("%a, %d %b %Y %H:%M:%S GMT")
        )
        etree.SubElement(prop, f"{{{OC_NS}}}permissions").text = "RDNVCK"

    # d:status
    status = etree.SubElement(propstat, f"{{{DAV_NS}}}status")
    status.text = "HTTP/1.1 200 OK"

    return response


def generate_etag(file_record: FileModel) -> str:
    """Generate a consistent ETag from file ID and updated_at."""
    raw = f"{file_record.id}:{file_record.updated_at.isoformat()}"
    return hashlib.md5(raw.encode()).hexdigest()
