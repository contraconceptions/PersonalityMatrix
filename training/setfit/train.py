"""Fine-tune the recognition model on labeled customer lines (roadmap R4), then export it for the extension.

    python -m venv .venv && . .venv/bin/activate && pip install -r training/setfit/requirements.txt
    python training/setfit/train.py --examples client-data/client-examples.json --builtin --name client-v1

SetFit (contrastive fine-tuning) pulls lines of the same customer type together in embedding space. The panel
keeps its own centroid + keyword classifier; only the fine-tuned sentence encoder is exported, as quantized ONNX,
in the layout transformers.js loads: public/models/local/<name>/.

Then compare it on held-out lines it never saw (use the held-out file from `npm run prepare-examples`):
    npm run benchmark-models -- --models local/client-v1,Xenova/all-MiniLM-L6-v2 \
        --examples client-data/client-examples.json --heldout client-data/client-heldout.json
Only switch if it clearly wins: set "id": "local/client-v1" and the fitted "temperature" in src/data/model.json,
then `npm run embed && npm test && npm run eval`. public/models/ is git-ignored: keep the model folder with the
client's deliverables, and never commit client lines.
"""

import argparse
import json
import shutil
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TOKENIZER_FILES = ("config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "vocab.txt")


def load_lines(path: Path) -> list[tuple[str, str]]:
    """Accepts an import file ({"customerExamples": {...}}) or a plain {"type": [lines]} file."""
    data = json.loads(path.read_text(encoding="utf-8"))
    lines = data.get("customerExamples", data)
    return [(text, label) for label, texts in lines.items() for text in texts]


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--examples", type=Path, action="append", default=[], help="labeled lines (repeatable)")
    p.add_argument("--builtin", action="store_true", help="also train on src/data/customerExamples.json")
    p.add_argument("--base", default="sentence-transformers/all-MiniLM-L6-v2", help="base sentence encoder")
    p.add_argument("--name", required=True, help="output folder name under public/models/local/")
    p.add_argument("--iterations", type=int, default=20, help="SetFit pair-sampling iterations per line")
    p.add_argument("--epochs", type=int, default=1)
    args = p.parse_args()

    rows = load_lines(ROOT / "src/data/customerExamples.json") if args.builtin else []
    for f in args.examples:
        rows += load_lines(f)
    labels = sorted({label for _, label in rows})
    if len(labels) < 2:
        raise SystemExit("Need labeled lines for at least two customer types.")
    counts = {label: sum(1 for _, l in rows if l == label) for label in labels}
    print(f"Training on {len(rows)} lines: " + ", ".join(f"{k} {v}" for k, v in counts.items()))

    # Imported here so --help works without the heavy dependencies installed.
    from datasets import Dataset
    from optimum.onnxruntime import ORTModelForFeatureExtraction, ORTQuantizer
    from optimum.onnxruntime.configuration import AutoQuantizationConfig
    from setfit import SetFitModel, Trainer, TrainingArguments

    dataset = Dataset.from_dict({"text": [t for t, _ in rows], "label": [labels.index(l) for _, l in rows]})
    model = SetFitModel.from_pretrained(args.base)
    trainer = Trainer(
        model=model,
        # num_iterations is deprecated in SetFit 1.x but still honored; it sizes the pair sampling for small sets.
        args=TrainingArguments(
            batch_size=16,
            num_epochs=args.epochs,
            num_iterations=args.iterations,
            seed=42,
            save_strategy="no",
            report_to="none",
        ),
        train_dataset=dataset,
    )
    trainer.train()

    out = ROOT / "public/models/local" / args.name
    with tempfile.TemporaryDirectory() as tmp:
        body = Path(tmp) / "body"
        model.model_body.save(str(body))  # sentence-transformers layout: transformer files at the root

        onnx_dir = Path(tmp) / "onnx"
        ort_model = ORTModelForFeatureExtraction.from_pretrained(str(body), export=True)
        ort_model.save_pretrained(onnx_dir)
        quant_dir = Path(tmp) / "quant"
        ORTQuantizer.from_pretrained(ort_model).quantize(
            save_dir=quant_dir,
            quantization_config=AutoQuantizationConfig.avx2(is_static=False, per_channel=False),
        )

        (out / "onnx").mkdir(parents=True, exist_ok=True)
        shutil.copy(onnx_dir / "model.onnx", out / "onnx/model.onnx")
        shutil.copy(quant_dir / "model_quantized.onnx", out / "onnx/model_quantized.onnx")
        for name in TOKENIZER_FILES:
            src = body / name if (body / name).exists() else onnx_dir / name
            if src.exists():
                shutil.copy(src, out / name)

    missing = [f for f in ("config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_quantized.onnx") if not (out / f).exists()]
    if missing:
        raise SystemExit(f"Export incomplete, missing: {', '.join(missing)}")
    print(f"Saved local/{args.name} to {out}")


if __name__ == "__main__":
    main()
