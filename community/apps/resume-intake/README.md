# resume-intake

`resume-intake` is an Xpert app plugin for importing ZIP packages that contain multiple candidates' resumes and proof documents.

Expected archive layout:

```text
张三/
  张三-简历.pdf
  学历证明.jpg
  离职证明.png

李四/
  李四简历.docx
  证书.pdf
```

## Features

- Plugin metadata, marketplace contents, and runtime provider declarations for `data-xpert`.
- Plugin configuration form for ZIP limits and allowed extensions.
- TypeORM entities for import batches, source documents, candidate profiles, field evidence, and reparse jobs.
- ZIP import service with path traversal, file count, size, and extension checks.
- Candidate grouping by top-level folder.
- Assistant middleware tools for listing candidates, reading source documents, saving profiles, recording failures, and finalizing batches.
- Fixed Workbench remote component for batches, candidates, source files, field evidence, review actions, and reparse tasks.
- Source document preview through platform file resolution, with ZIP entry data URLs as the plugin-local fallback.
- Resume Intake assistant template for extraction workflows.

## Build

```sh
pnpm --filter resume-intake build
pnpm --filter resume-intake test
```

The build emits TypeScript output to `dist/` and copies the Workbench remote component asset required by the view provider.

## Runtime Notes

- Register the package through the Xpert plugin loader.
- The npm package name and plugin runtime identifier are both `resume-intake`.
- The large-model extraction runs through the Xpert assistant and its file understanding/runtime capabilities. The plugin owns ZIP ingestion, grouping, review persistence, source-file preview references, and workflow orchestration.

Available middleware tools:

- `resume_list_import_batch_candidates`
- `resume_read_source_document`
- `resume_save_candidate_profile`
- `resume_report_candidate_parse_failure`
- `resume_finalize_import_batch`
