# 按设备类型逐一测：厂商格式 + 标准格式（含 INC-001）
$ErrorActionPreference = 'Stop'
$Base = if ($env:BACKEND_URL) { $env:BACKEND_URL.TrimEnd('/') } else { 'http://127.0.0.1:8000' }
$Token = if ($env:MQTT_INGEST_TOKEN) { $env:MQTT_INGEST_TOKEN } else { 'dev-mqtt-ingest-token' }
$Headers = @{
  'Content-Type'   = 'application/json'
  'X-Ingest-Token' = $Token
}

$cases = @(
  @{ name = '1 vendor rainfall RAIN-001'; body = @{ devId = 'RAIN-001'; rain_mm = 65; bat = 90; topic = 'geo/telemetry/rainfall/RAIN-001'; async = $false } }
  @{ name = '2 vendor npr NPR-001'; body = @{ sn = 'NPR-001'; F = 88.5; stress = 42; batt = 85; topic = 'geo/telemetry/npr_anchor/NPR-001'; async = $false } }
  @{ name = '3 vendor fiber FIB-001'; body = @{ id = 'FIB-001'; strain = 450; stress = 55; temp = 26.5; topic = 'geo/telemetry/fiber_optic/FIB-001'; async = $false } }
  @{ name = '4 vendor gnss GNSS-001'; body = @{ imei = 'GNSS-001'; dx = 12; dy = 5; dz = 1; battery = 95; topic = 'geo/telemetry/gnss/GNSS-001'; async = $false } }
  @{ name = '5 vendor camera CAM-001'; body = @{ cam = 'CAM-001'; temp = 48; event = 'motion'; bat = 60; topic = 'geo/telemetry/camera/CAM-001'; async = $false } }
  @{ name = '6 vendor inclinometer INC-001'; body = @{ code = 'INC-001'; tilt_x = 1.2; tilt_y = 0.8; battery = 88; topic = 'geo/telemetry/inclinometer/INC-001'; async = $false } }
  @{ name = '7 std RAIN-001'; body = @{ device_code = 'RAIN-001'; data_type = 'rainfall'; value = 65; unit = 'mm'; topic = 'geo/telemetry/RAIN-001'; async = $false } }
  @{ name = '8 std NPR-001 force'; body = @{ device_code = 'NPR-001'; data_type = 'force'; value = 88.5; unit = 'kN'; topic = 'geo/telemetry/NPR-001'; async = $false } }
  @{ name = '9 std FIB-001 strain'; body = @{ device_code = 'FIB-001'; data_type = 'strain'; value = 450; unit = 'ue'; topic = 'geo/telemetry/FIB-001'; async = $false } }
  @{ name = '10 std GNSS-001 H'; body = @{ device_code = 'GNSS-001'; data_type = 'displacement'; channel = 'H'; value = 12; unit = 'mm'; topic = 'geo/telemetry/GNSS-001'; async = $false } }
  @{ name = '11 std CAM-001 temp'; body = @{ device_code = 'CAM-001'; data_type = 'temperature'; value = 48; unit = 'C'; topic = 'geo/telemetry/CAM-001'; async = $false } }
  @{ name = '12 std INC-001 H'; body = @{ device_code = 'INC-001'; data_type = 'displacement'; channel = 'H'; value = 9; unit = 'deg'; topic = 'geo/telemetry/INC-001'; async = $false } }
)

foreach ($c in $cases) {
  Write-Host "`n== $($c.name) ==" -ForegroundColor Cyan
  $json = $c.body | ConvertTo-Json -Compress
  try {
    $preview = Invoke-RestMethod -Method Post -Uri "$Base/api/monitoring/ingest/preview/" -Headers $Headers -Body $json
    Write-Host ("PREVIEW type={0} points={1}" -f $preview.device_type, ($preview.points | ConvertTo-Json -Compress))
    $ing = Invoke-RestMethod -Method Post -Uri "$Base/api/monitoring/ingest/mqtt/" -Headers $Headers -Body $json
    Write-Host ("INGEST ok ids={0} warnings={1}" -f (($ing.monitor_data_ids) -join ','), ($ing.warnings | ConvertTo-Json -Compress))
  }
  catch {
    Write-Host "FAIL: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message }
  }
}

Write-Host "`nDone. 说明: services/mqtt_bridge/MQTT_FX.txt" -ForegroundColor Green
