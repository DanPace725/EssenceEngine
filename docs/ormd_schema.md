# ORMD File Structure Schema

## Overview

Open Relational Markdown (ORMD) is a document format that combines Markdown with a relational layer for semantic connections, verifiable provenance, and collaboration. This guide shows you how to structure ORMD files.

## Basic File Structure

Every ORMD file has three main parts:

1. **Version Tag** (required)
2. **YAML Front Matter** (required)
3. **Markdown Body** (required)

```markdown
<!-- ormd:0.1 -->
---
[YAML front matter goes here]
---

[Markdown content goes here]
```

## 1. Version Tag

The first line must be the ORMD version tag:

```markdown
<!-- ormd:0.1 -->
```

This identifies the file as ORMD version 0.1.

## 2. YAML Front Matter Structure

The front matter is enclosed between `---` delimiters and contains document metadata.

### Required Fields

```yaml
title: "Your Document Title"
authors: 
  - "Author Name"
  - "Another Author"
links:
  - id: link-identifier
    rel: relationship-type
    to: "target-location"
```

### Optional Core Fields

```yaml
dates:
  created: '2025-09-19T14:30:00Z'
  modified: '2025-09-19T14:30:00Z'

version: "1.0"

status: "draft" | "in-progress" | "complete" | "archived"

description: "Brief description of the document"
```

### Optional Context Block (Experimental)

The context block enables lineage tracking and explicit uncertainty:

```yaml
context:
  lineage:
    source: "conversation-identifier"
    parent_docs: 
      - "path/to/parent.ormd"
      - "path/to/another-parent.ormd"
  resolution:
    confidence: "exploratory" | "working" | "validated"
```

## Complete YAML Front Matter Example

```yaml
---
title: "Project Planning Document"
authors:
  - "Alice Johnson"
  - "Bob Smith"
dates:
  created: '2025-09-19T14:30:00Z'
  modified: '2025-09-20T09:15:00Z'
context:
  lineage:
    source: "team-meeting-2025-09-19"
    parent_docs: ["../previous/project-charter.ormd"]
  resolution:
    confidence: "working"
links:
  - id: charter-ref
    rel: derives_from
    to: "../previous/project-charter.ormd"
  - id: requirements
    rel: defines
    to: "#requirements-section"
  - id: timeline
    rel: specifies
    to: "#project-timeline"
version: "1.0"
status: "draft"
description: "Initial project planning and requirements documentation"
---
```

## 3. Markdown Body

The body uses standard Markdown with ORMD-specific link syntax.

### Link Syntax

**Inline relational link:**
```markdown
[display text](target "relationship-type")
```

**Reference link (must be defined in front matter):**
```markdown
[[link-id]]
```

**Heading anchors:**
```markdown
## Section Title {#section-anchor}

Reference this with: [[link-to-section]]
```

### Example Markdown Body

```markdown
# Project Overview

This document defines the [[requirements]] requirements for our new system.
The approach [[charter-ref]] builds on our existing charter.

## Requirements Section {#requirements-section}

1. System must handle 10,000 concurrent users
2. Response time under 200ms
3. 99.9% uptime guarantee

## Project Timeline {#project-timeline}

**Phase 1**: Research and planning (2 weeks)
**Phase 2**: Development (8 weeks)
**Phase 3**: Testing and deployment (2 weeks)
```

## Complete ORMD File Example

```markdown
<!-- ormd:0.1 -->
---
title: "Meeting Notes: Sprint Planning"
authors: ["Development Team"]
dates:
  created: '2025-09-19T14:30:00Z'
context:
  lineage:
    source: "zoom-meeting-sprint-42"
    parent_docs: ["../previous-sprint/retro.ormd"]
  resolution:
    confidence: "working"
links:
  - id: retro-review
    rel: references
    to: "../previous-sprint/retro.ormd"
  - id: action-items
    rel: tracks
    to: "#actions"
status: "complete"
description: "Sprint 42 planning session notes and decisions"
---

# Sprint Planning Notes

Based on our [[retro-review]] retrospective, we identified three key areas
for improvement this sprint.

## Action Items {#actions}

1. Refactor authentication module
2. Improve test coverage to 80%
3. Update documentation

## Decisions Made

- Moving to two-week sprint cycles
- Daily standups at 9:30 AM
- Code review required before merge
```

## Field Reference

### Authors Field

Can be simple strings or structured objects:

```yaml
# Simple format
authors:
  - "Alice Johnson"
  - "Bob Smith"

# Structured format
authors:
  - id: alice
    display: "Alice Johnson"
    email: "alice@example.com"
```

### Links Field

Required but can be empty array:

```yaml
# Minimal
links: []

# With relationships
links:
  - id: unique-identifier
    rel: relationship-type
    to: "target-path-or-url"
```

Common relationship types: `derives_from`, `extends`, `implements`, `references`, `defines`, `specifies`, `updates`, `tracks_progress_on`

### Context.Resolution.Confidence Levels

- **exploratory**: Early ideas, brainstorming, uncertain conclusions
- **working**: Tested concepts with reasonable confidence
- **validated**: High confidence, thoroughly tested/reviewed

### Dates Format

Use ISO 8601 format with UTC timezone:

```yaml
dates:
  created: '2025-09-19T14:30:00Z'
  modified: '2025-09-20T09:15:00Z'
```

## Validation Rules

1. **Version tag** must be first line
2. **Front matter** must be valid YAML between `---` delimiters
3. **Required fields**: title, authors, links (can be empty array)
4. **Link references** in body must be defined in front matter
5. **Context confidence** must be one of: exploratory, working, validated
6. **Parent docs** must be array of strings (paths)

## Backward Compatibility

- Files without `context` block are fully valid
- Parsers that don't support context should ignore it
- All existing ORMD 0.1 files remain valid with context extension

## Quick Start Template

```markdown
<!-- ormd:0.1 -->
---
title: "Your Title Here"
authors: ["Your Name"]
dates:
  created: '2025-MM-DDTHH:MM:SSZ'
links: []
status: "draft"
description: "Brief description"
---

# Your Title Here

Your content goes here.
```

## ORMD Schema

This document outlines the schema for structuring ORMD files used in the Essence Engine. It provides a detailed description of the fields, their types, and any constraints that apply.

## Schema Structure
- **Field Name**: Description of the field and its purpose.
- **Type**: Data type of the field (e.g., string, integer, boolean).
- **Constraints**: Any constraints that apply to the field (e.g., required, unique).

## Example
```json
{
  "fieldName": "value",
  "anotherField": 123
}
```

## Notes
- Ensure that all ORMD files adhere to this schema for compatibility with the Essence Engine.
- Update this document as new fields or changes are introduced to the schema.

## Additional Resources
https://github.com/DanPace725/ormd
