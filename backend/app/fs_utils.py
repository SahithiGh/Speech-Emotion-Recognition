"""Filesystem safety utilities: path validation, recursion guards, safe copying, and bottom-up directory unwinding."""

import os
from pathlib import Path
from typing import List, Optional, Set, Tuple, Union
import zipfile


class PathSecurityError(ValueError):
    """Raised when a path violates safety, depth, or nesting constraints."""
    pass


def resolve_safe_path(path: Union[str, Path]) -> Path:
    """Resolve an absolute, normalized path."""
    return Path(path).resolve()


def check_repeated_segments(path: Union[str, Path], max_allowed_repeats: int = 2) -> Tuple[bool, Optional[str]]:
    """Check if any folder name repeats consecutively or excessively in the path hierarchy.
    
    Returns (has_excessive_repeats, repeated_folder_name).
    """
    parts = Path(path).parts
    counts = {}
    consecutive = 1
    last = None

    for p in parts:
        p_lower = p.lower()
        if p_lower == last:
            consecutive += 1
            if consecutive > max_allowed_repeats:
                return True, p
        else:
            consecutive = 1
            last = p_lower
        counts[p_lower] = counts.get(p_lower, 0) + 1
        if counts[p_lower] > max_allowed_repeats * 2 and len(p_lower) > 3:
            return True, p

    return False, None


def validate_safe_path(
    path: Union[str, Path],
    base_dir: Optional[Union[str, Path]] = None,
    max_depth: int = 25,
    max_name_repeats: int = 2
) -> Path:
    """Validate that a path is safe, bounded in depth, and has no recursive folder loops."""
    resolved = resolve_safe_path(path)

    if base_dir is not None:
        resolved_base = resolve_safe_path(base_dir)
        try:
            rel = resolved.relative_to(resolved_base)
            depth = len(rel.parts)
        except ValueError:
            raise PathSecurityError(f"Path '{resolved}' escapes base directory '{resolved_base}'.")
    else:
        depth = len(resolved.parts)

    if depth > max_depth:
        raise PathSecurityError(
            f"Path depth {depth} exceeds safe limit of {max_depth}: '{resolved}'"
        )

    has_repeats, repeated_name = check_repeated_segments(resolved, max_allowed_repeats=max_name_repeats)
    if has_repeats:
        raise PathSecurityError(
            f"Path contains suspicious recursive folder repetitions ('{repeated_name}'): '{resolved}'"
        )

    return resolved


def is_descendant_or_same(src: Union[str, Path], dst: Union[str, Path]) -> bool:
    """Return True if dst is identical to src or is located inside src."""
    src_res = resolve_safe_path(src)
    dst_res = resolve_safe_path(dst)

    if src_res == dst_res:
        return True

    try:
        dst_res.relative_to(src_res)
        return True
    except ValueError:
        return False


def safe_copy_directory(
    src: Union[str, Path],
    dst: Union[str, Path],
    ignore_names: Optional[Set[str]] = None,
    max_depth: int = 15
) -> int:
    """Safely copy files from src directory to dst directory.
    
    Prevents copying a directory into itself or its own descendants.
    """
    src_path = resolve_safe_path(src)
    dst_path = resolve_safe_path(dst)

    if not src_path.is_dir():
        raise FileNotFoundError(f"Source directory does not exist: {src_path}")

    if is_descendant_or_same(src_path, dst_path):
        raise PathSecurityError(
            f"Cannot copy directory '{src_path}' into itself or its descendant '{dst_path}'. "
            "Recursive nesting prevented."
        )

    if is_descendant_or_same(dst_path, src_path):
        raise PathSecurityError(
            f"Cannot copy directory: source '{src_path}' is inside destination '{dst_path}'."
        )

    validate_safe_path(dst_path, max_depth=max_depth)

    ignored = ignore_names or set()
    copied_count = 0

    for root, dirs, files in os.walk(str(src_path)):
        rel = Path(root).relative_to(src_path)
        
        # Check depth
        if len(rel.parts) > max_depth:
            raise PathSecurityError(f"Traversal depth exceeded max_depth ({max_depth}) at '{root}'")

        # Prune ignored dirs
        dirs[:] = [d for d in dirs if d not in ignored and not is_descendant_or_same(src_path / rel / d, dst_path)]

        target_root = dst_path / rel
        target_root.mkdir(parents=True, exist_ok=True)

        for f in files:
            if f in ignored:
                continue
            src_file = Path(root) / f
            dst_file = target_root / f
            # Atomic or direct copy
            with open(src_file, "rb") as rf, open(dst_file, "wb") as wf:
                while chunk := rf.read(65536):
                    wf.write(chunk)
            copied_count += 1

    return copied_count


def safe_extract_zip(
    zip_path: Union[str, Path],
    target_dir: Union[str, Path],
    max_depth: int = 15,
    max_name_repeats: int = 2
) -> List[str]:
    """Safely extract zip archive guarding against ZipSlip and recursive directories."""
    target_path = resolve_safe_path(target_dir)
    target_path.mkdir(parents=True, exist_ok=True)
    extracted = []

    with zipfile.ZipFile(zip_path, "r") as zf:
        for member in zf.infolist():
            # Check path safety
            member_path = target_path / member.filename
            resolved_member = member_path.resolve()

            # ZipSlip prevention
            try:
                rel = resolved_member.relative_to(target_path)
            except ValueError:
                raise PathSecurityError(f"ZipSlip vulnerability detected in entry: '{member.filename}'")

            # Depth & recursive folder check
            if len(rel.parts) > max_depth:
                raise PathSecurityError(
                    f"Zip member '{member.filename}' exceeds maximum directory depth of {max_depth}."
                )

            has_repeats, rep = check_repeated_segments(rel, max_allowed_repeats=max_name_repeats)
            if has_repeats:
                raise PathSecurityError(
                    f"Zip member '{member.filename}' contains suspicious recursive repetition '{rep}'."
                )

            zf.extract(member, target_path)
            extracted.append(str(rel))

    return extracted


def inspect_nested_directory(
    base_dir: Union[str, Path],
    folder_name: str
) -> dict:
    """Iteratively inspect a nested directory chain without recursion.
    
    Returns inspection details including total depth and any discovered files.
    """
    orig_cwd = os.getcwd()
    target_root = resolve_safe_path(base_dir) / folder_name

    if not target_root.exists():
        return {"exists": False, "depth": 0, "files": [], "error": None}

    depth = 0
    discovered_files = []
    error = None

    try:
        os.chdir(str(target_root))
        depth = 1

        while True:
            try:
                entries = os.listdir(".")
            except Exception as e:
                error = str(e)
                break

            files = [e for e in entries if not os.path.isdir(e)]
            dirs = [e for e in entries if os.path.isdir(e)]

            if files:
                for f in files:
                    try:
                        sz = os.path.getsize(f)
                    except Exception:
                        sz = -1
                    discovered_files.append({"depth": depth, "name": f, "size": sz})

            if folder_name in dirs:
                try:
                    os.chdir(folder_name)
                    depth += 1
                except Exception as e:
                    error = str(e)
                    break
            else:
                break

    finally:
        os.chdir(orig_cwd)

    return {
        "exists": True,
        "depth": depth,
        "files": discovered_files,
        "error": error
    }


def safe_unwind_nested_empty_directory(
    parent_dir: Union[str, Path],
    folder_name: str,
    dry_run: bool = True
) -> dict:
    """Safely remove a deeply nested chain of empty directories from the bottom up.
    
    Avoids recursion, avoids stack overflow, and checks at every level that
    no non-empty user files are harmed.
    
    Returns operation report: {"success": bool, "depth_removed": int, "dry_run": bool, "error": Optional[str]}
    """
    parent_path = resolve_safe_path(parent_dir)
    target_root = parent_path / folder_name

    if not target_root.exists():
        return {"success": True, "depth_removed": 0, "dry_run": dry_run, "message": "Directory does not exist."}

    # Step 1: Pre-inspection
    inspection = inspect_nested_directory(parent_path, folder_name)
    if inspection["files"]:
        return {
            "success": False,
            "depth_removed": 0,
            "dry_run": dry_run,
            "error": f"Refusing to delete: {len(inspection['files'])} file(s) found in nested hierarchy.",
            "files": inspection["files"]
        }

    total_depth = inspection["depth"]
    if dry_run:
        return {
            "success": True,
            "depth_removed": total_depth,
            "dry_run": True,
            "message": f"Dry-run verified: {total_depth} empty nested '{folder_name}' directories ready to safely unwind."
        }

    # Step 2: Live bottom-up unwinding
    orig_cwd = os.getcwd()
    removed_count = 0
    error_msg = None

    try:
        # Step down to bottom
        os.chdir(str(target_root))
        depth = 1
        while True:
            # Check if next level exists
            if os.path.exists(folder_name) and os.path.isdir(folder_name):
                try:
                    os.chdir(folder_name)
                    depth += 1
                except Exception:
                    # Can't step down further; current dir is leaf
                    break
            else:
                break

        # Now unwind from leaf to root
        while depth > 1:
            os.chdir("..")
            # Verify folder_name in current dir is empty before removing
            try:
                os.rmdir(folder_name)
                removed_count += 1
                depth -= 1
            except Exception as e:
                error_msg = f"Failed to rmdir at depth {depth}: {e}"
                break

        # Remove top-level target_root from parent_path
        os.chdir(str(parent_path))
        if os.path.exists(folder_name) and not error_msg:
            try:
                os.rmdir(folder_name)
                removed_count += 1
            except Exception as e:
                error_msg = f"Failed to rmdir top-level '{folder_name}': {e}"

    finally:
        os.chdir(orig_cwd)

    return {
        "success": error_msg is None and not (parent_path / folder_name).exists(),
        "depth_removed": removed_count,
        "dry_run": False,
        "error": error_msg
    }

