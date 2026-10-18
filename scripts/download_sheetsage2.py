"""Cache only the official model files needed for offline inference."""

import json
from pathlib import Path

from huggingface_hub import snapshot_download

common = dict(
    allow_patterns=["*.py", "*.json", "model.safetensors", "LICENSE"],
    ignore_patterns=["tests/**", "benchmarks/**", "assets/**", "render_assets/**"],
    max_workers=1,
)
SHEETSAGE_REVISION = "b83c3d79a6d98bcffaf8f9ed112c90aa887887bc"
print("Downloading m-a-p/SheetSage2...", flush=True)
sheet_dir = Path(snapshot_download(repo_id="m-a-p/SheetSage2", revision=SHEETSAGE_REVISION, **common))
config = json.loads((sheet_dir / "config.json").read_text(encoding="utf-8"))
print("Downloading its pinned MERT-v2 parent...", flush=True)
snapshot_download(
    repo_id=config["base_model_name_or_path"],
    revision=config["base_model_revision"],
    **common,
)
print("Official SheetSage2 and MERT model files are cached.", flush=True)
