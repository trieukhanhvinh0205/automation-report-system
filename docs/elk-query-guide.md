# ELK Query Guide (Based on terminal_output.md)

## API

- `GET /reports/elk`
- `POST /reports/elk/export-word`

Both APIs now support filter fields from real ELK data.

## Supported Query Fields

Time range:
- `startTime`, `endTime` -> filter on `@timestamp`
- `openCaseStartTime`, `openCaseEndTime` -> `open_case_time`
- `analyzedStartTime`, `analyzedEndTime` -> `case_analyzed_time`
- `detectedStartTime`, `detectedEndTime` -> `case_detected_time`

Basic filters:
- `severity`
- `priority`
- `tenant` (or `tenantId`)
- `analyst` -> `user_closed_case`
- `resolution`
- `status` (`true`/`false`)
- `sla` (`true`/`false`)
- `platform`

Case identity filters:
- `soarId` -> `soar_id`
- `siemAlertId` -> `siem_alert_id`
- `soarCaseName` -> `soar_case_name`

MITRE filters:
- `tactics` (comma separated)
- `techniques` (comma separated)

Text filters:
- `alertName`
- `reasonCloseCase`
- `messageConfirmCase`
- `q` (global text search)

Numeric range filters:
- `minTimeDiffMinutes`, `maxTimeDiffMinutes`
- `minDetectedToAnalyzedMinutes`, `maxDetectedToAnalyzedMinutes`
- `minOpenToDetectedMinutes`, `maxOpenToDetectedMinutes`

General:
- `size` (default 200)

## Example - Query by date range + severity + tenant

`GET /reports/elk?startTime=2026-05-07T00:00:00.000Z&endTime=2026-05-07T23:59:59.999Z&severity=Low&tenant=bd`

## Example - Query by analyst + tactic + status

`GET /reports/elk?analyst=minh.Luong@ncsgroup.vn&tactics=Privilege%20Escalation&status=false`

## Example - Export Word with same filters

`POST /reports/elk/export-word`

```json
{
  "startTime": "2026-05-07T00:00:00.000Z",
  "endTime": "2026-05-07T23:59:59.999Z",
  "severity": "Medium",
  "tenant": "bd",
  "analyst": "minh.Luong@ncsgroup.vn",
  "q": "0365 Multiple Login Failures"
}
```
