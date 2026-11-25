# Report tooling

Python utilities and generated academic/project artifacts live here so the application root stays Node-only.

## Scripts

| Script | Purpose |
| --- | --- |
| `build_project_report.py` | Generates `Generated_Project_Report.docx` from the repo's source/config and the diagrams below. |
| `validate_report.py` | Validates the committed report and checks it matches fresh generator output (`docs:validate`). |
| `generate_diagrams.py` | Regenerates the four architecture/dataflow/AI/schema PNG figures. |
| `generate_pptx.py` | Regenerates `Whiteboard_io_Presentation.pptx`. |
| `generate_summary_pptx.py` | Regenerates the 10-slide visual deck `docs/Whiteboard_io_Presentation.pptx`. |
| `scan_secrets.py` | CI secret scanner (`secret:scan`). |
| `requirements.txt` | Pinned Python dependencies (`matplotlib`, `python-docx`, `python-pptx`). |

## Artifacts

- `../Whiteboard_io_Presentation.pptx` (10-slide visual overview & flowchart deck)
- `Generated_Project_Report.docx`
- `diagram_architecture.png`, `diagram_dataflow.png`, `diagram_ai_pipeline.png`, `diagram_database_schema.png`
- `Whiteboard_io_Presentation.pptx` (current deck)
- `Whiteboard_io_Presentation_legacy.pptx` (archived earlier deck)

## Commands

Run from the repository root:

```bash
python -m pip install -r docs/report-tooling/requirements.txt
npm run docs:report        # regenerate the DOCX report
npm run docs:diagrams      # regenerate the PNG figures
npm run docs:presentation  # regenerate the PPTX deck
npm run docs:validate      # validate the report and freshness
npm run secret:scan        # scan tracked files for secrets
```

All scripts resolve their input/output paths relative to this folder, so they work regardless of the current working directory.
