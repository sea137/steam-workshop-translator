local http = require("http")
local json = require("json")
local fs = require("fs")
local millennium = require("millennium")
local cache = {}
local cache_count = 0
local loaded = false
local cache_file = millennium.steam_path() .. "/millennium/config/workshop-translator-cache.json"

local function load_cache()
    if loaded then return end
    loaded = true
    local file = io.open(cache_file, "rb")
    if not file then return end
    local bytes = file:read(8000001)
    file:close()
    if #bytes > 8000000 then return end
    local ok, value = pcall(json.decode, bytes)
    if ok and type(value) == "table" then
        for k, v in pairs(value) do
            if type(k) == "string" and type(v) == "string" and cache_count < 1500 then
                cache[k] = v
                cache_count = cache_count + 1
            end
        end
    end
end

local function save_cache()
    fs.create_directories(millennium.steam_path() .. "/millennium/config")
    local file = io.open(cache_file, "wb")
    if file then file:write(json.encode(cache)); file:close() end
end

local function encode_url(text)
    return (text:gsub("([^%w%-_%.~])", function(c)
        return string.format("%%%02X", string.byte(c))
    end))
end

local function request_translation(text)
    local response = http.get("https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=" .. encode_url(text), {
        timeout = 18,
        verify_ssl = true,
        follow_redirects = false,
        user_agent = "HaijingTools/0.2.0"
    })
    if not response or response.status ~= 200 then
        local status = response and tostring(response.status) or "网络不通"
        return nil, "翻译服务连接失败（" .. status .. "），请检查网络后点击重试。"
    end
    local ok, result = pcall(json.decode, response.body)
    if not ok or type(result) ~= "table" or type(result[1]) ~= "table" then
        return nil, "翻译服务返回格式异常，请稍后重试。"
    end
    local pieces = {}
    for _, sentence in ipairs(result[1]) do
        if type(sentence) == "table" and type(sentence[1]) == "string" then
            pieces[#pieces + 1] = sentence[1]
        end
    end
    local translation = table.concat(pieces)
    if #translation == 0 then return nil, "翻译服务未返回文字。" end
    return translation
end

local function remember(text, translation)
    if cache_count >= 1500 then cache = {}; cache_count = 0 end
    if not cache[text] then cache_count = cache_count + 1 end
    cache[text] = translation
end

-- A fixed delimiter is used only when the input does not contain it. Every
-- boundary, including the final one, must survive unchanged and in order.
local function batch_translation(texts)
    local parts = {}
    for i, text in ipairs(texts) do
        if text:find("⟦HJ_", 1, true) then return nil end
        parts[#parts + 1] = string.format("⟦HJ_%02d⟧\n%s", i, text)
    end
    parts[#parts + 1] = "⟦HJ_END⟧"
    local translated, err = request_translation(table.concat(parts, "\n"))
    if not translated then return nil, err end
    local output = {}
    local position = 1
    for i = 1, #texts do
        local marker = string.format("⟦HJ_%02d⟧", i)
        local start_pos, end_pos = translated:find(marker, position, true)
        if not start_pos or translated:sub(position, start_pos - 1):match("%S") then return nil end
        local next_marker = i == #texts and "⟦HJ_END⟧" or string.format("⟦HJ_%02d⟧", i + 1)
        local next_pos = translated:find(next_marker, end_pos + 1, true)
        if not next_pos then return nil end
        local text = translated:sub(end_pos + 1, next_pos - 1):gsub("^%s+", ""):gsub("%s+$", "")
        if text == "" or text:find("⟦HJ_", 1, true) then return nil end
        if texts[i]:sub(-1) == "\n" then text = text .. "\n" end
        output[i] = text
        position = next_pos
    end
    if translated:sub(position) ~= "⟦HJ_END⟧" and translated:sub(position):gsub("%s+$", "") ~= "⟦HJ_END⟧" then return nil end
    return output
end

---@ffi
---@param payload string
---@return string
function translateTexts(payload)
    if type(payload) ~= "string" or #payload > 30000 then
        return json.encode({ ok = false, error = "翻译请求过大。" })
    end
    local valid, texts = pcall(json.decode, payload)
    if not valid or type(texts) ~= "table" or #texts < 1 or #texts > 8 then
        return json.encode({ ok = false, error = "翻译请求格式异常。" })
    end
    for _, text in ipairs(texts) do
        if type(text) ~= "string" or #text == 0 or #text > 7000 then
            return json.encode({ ok = false, error = "文本为空或过长，请刷新页面后重试。" })
        end
    end
    load_cache()
    local missing, seen = {}, {}
    for _, text in ipairs(texts) do
        if not cache[text] and not seen[text] then missing[#missing + 1] = text; seen[text] = true end
    end
    local fresh, failures = {}, {}
    local translated, service_error
    if #missing > 1 then translated, service_error = batch_translation(missing) end
    for i, text in ipairs(missing) do
        local result, err
        if translated then result = translated[i]
        elseif service_error then err = service_error
        else result, err = request_translation(text) end
        if result then remember(text, result); fresh[text] = true
        else failures[text] = err or "翻译服务未返回文字。" end
    end
    if next(fresh) then save_cache() end
    local items = {}
    for i, text in ipairs(texts) do
        if cache[text] then items[i] = { ok = true, text = cache[text], cached = not fresh[text] }
        else items[i] = { ok = false, error = failures[text] } end
    end
    return json.encode({ ok = true, items = items })
end

---@ffi
---@param text string
---@return string
function translateText(text)
    if type(text) ~= "string" or #text == 0 or #text > 7000 then
        return json.encode({ ok = false, error = "文本为空或过长，请刷新页面后重试。" })
    end
    local response = json.decode(translateTexts(json.encode({ text })))
    return json.encode(response.items and response.items[1] or response)
end

---@ffi
---@return boolean
function clearTranslationCache()
    loaded = true
    cache = {}
    cache_count = 0
    save_cache()
    return true
end
