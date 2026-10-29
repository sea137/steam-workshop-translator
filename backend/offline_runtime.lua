-- The fixed command invokes only our installed helper; it accepts no page arguments.
local http = require("http")
local json = require("json")
local utils = require("utils")
local runtime = {}
local retry_at = 0
local last_state = "starting"
local command = [[powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -Command "& (Join-Path $env:LOCALAPPDATA 'HaijingTools\offline\Start-OnDemand.ps1')"]]

function runtime.prepare()
    local response = http.get("http://127.0.0.1:17653/health", {timeout=1, proxy="", verify_ssl=true, follow_redirects=false})
    if response then
        local ok, health = pcall(json.decode, response.body)
        if response.status == 200 and ok and type(health) == "table" and health.ok == true and health.service == "HaijingToolsOffline" then
            retry_at = 0
            return {ok=true, state="ready"}
        end
        return {ok=false, state="unavailable"}
    end
    if os.time() < retry_at then return {ok=true, state=last_state} end
    retry_at = os.time() + 20
    local ok, output, status = pcall(utils.exec, command)
    if ok and type(output) == "string" and (status == 0 or status == nil) then
        if output:find("HAIJING_MISSING", 1, true) then last_state="missing"
        elseif output:find("HAIJING_STARTING", 1, true) then last_state="starting"
        else last_state="unavailable" end
    else last_state="unavailable" end
    return {ok=last_state ~= "unavailable", state=last_state}
end
return runtime
