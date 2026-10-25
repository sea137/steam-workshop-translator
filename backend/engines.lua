-- Non-ASCII literals use decimal byte escapes in release source; see docs/PROVIDERS.md.
local http = require("http")
local json = require("json")
local engines = {}
local cooldown = {}
local cooldown_reason = {}
local deadline = 0

function engines.begin_request()
    -- The framework waits 30s for an RPC. Keep the entire provider chain well
    -- below that, including multiple MyMemory chunks and Google fallbacks.
    deadline = os.time() + 12
end

local function perform(url, opts)
    local remaining = deadline - os.time()
    if remaining < 1 then return nil end
    opts.timeout = math.min(opts.timeout, remaining)
    if opts.method then return http.request(url, opts) end
    return http.get(url, opts)
end

-- Millennium uses LuaJIT (Lua 5.1), which has no standard utf8 library.
local function codepoints(text)
    local index = 1
    return function()
        if index > #text then return nil end
        local at, first = index, text:byte(index)
        local width = first < 128 and 1 or first < 224 and 2 or first < 240 and 3 or 4
        local cp = first % (width == 1 and 256 or 2 ^ (7 - width))
        for j = 1, width - 1 do
            local next_byte = text:byte(index + j)
            if not next_byte or next_byte < 128 or next_byte > 191 then error("Invalid UTF-8") end
            cp = cp * 64 + next_byte - 128
        end
        index = index + width
        return at, cp
    end
end

local function unicode_char(cp)
    if not cp or cp < 0 or cp > 0x10ffff or (cp >= 0xd800 and cp <= 0xdfff) then error("Invalid scalar") end
    if cp < 128 then return string.char(cp) end
    if cp < 2048 then return string.char(192 + math.floor(cp / 64), 128 + cp % 64) end
    if cp < 65536 then return string.char(224 + math.floor(cp / 4096), 128 + math.floor(cp / 64) % 64, 128 + cp % 64) end
    return string.char(240 + math.floor(cp / 262144), 128 + math.floor(cp / 4096) % 64, 128 + math.floor(cp / 64) % 64, 128 + cp % 64)
end

local function encode(text)
    return (text:gsub("([^%w%-_%.~])", function(c) return string.format("%%%02X", string.byte(c)) end))
end

local function decoded(response)
    if not response then return nil end
    local ok, value = pcall(json.decode, response.body)
    if ok and type(value) == "table" then return value end
end

local function options(timeout)
    return { timeout = timeout or 5, verify_ssl = true, follow_redirects = false, user_agent = "HaijingTools/0.3.1" }
end

local function cooling(id)
    local seconds = (cooldown[id] or 0) - os.time()
    if seconds > 0 then return (cooldown_reason[id] or "\231\191\187\232\175\145\230\156\141\229\138\161\230\154\130\230\151\182\233\153\144\230\181\129\239\188\136HTTP 429\239\188\137\227\128\130") .. "\232\175\183\231\173\137\229\190\133\231\186\166 " .. seconds .. " \231\167\146\229\144\142\229\134\141\232\175\149\239\188\140\230\136\150\229\136\135\230\141\162\231\191\187\232\175\145\230\186\144\239\188\155\232\175\183\229\139\191\232\191\158\231\187\173\233\135\141\232\175\149\230\136\150\230\184\133\231\188\147\229\173\152\227\128\130" end
end

local function google_one(text)
    local err = cooling("google")
    if err then return nil, err end
    local response = perform("https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=" .. encode(text), options())
    if not response or response.status ~= 200 then
        if response and response.status == 429 then
            cooldown.google = os.time() + 60
            cooldown_reason.google = nil
            return nil, "Google \231\191\187\232\175\145\230\156\141\229\138\161\230\154\130\230\151\182\233\153\144\230\181\129\239\188\136HTTP 429\239\188\137\227\128\130\230\154\130\229\129\156\230\150\176\232\175\183\230\177\130 60 \231\167\146\239\188\140\229\143\175\233\128\137\230\139\169\232\135\170\229\138\168\229\136\135\230\141\162\230\136\150\229\133\182\228\187\150\231\191\187\232\175\145\230\186\144\239\188\155\230\156\141\229\138\161\231\171\175\229\143\175\232\131\189\233\156\128\232\166\129\230\155\180\233\149\191\230\151\182\233\151\180\230\129\162\229\164\141\227\128\130"
        end
        -- Briefly avoid hitting an unavailable service for every page batch.
        cooldown.google = os.time() + 15
        cooldown_reason.google = "Google \230\154\130\228\184\141\229\143\175\231\148\168\227\128\130"
        return nil, "Google \231\191\187\232\175\145\232\191\158\230\142\165\229\164\177\232\180\165\239\188\136" .. (response and tostring(response.status) or "\231\189\145\231\187\156\228\184\141\233\128\154") .. "\239\188\137\239\188\140\232\175\183\231\168\141\229\144\142\233\135\141\232\175\149\230\136\150\229\136\135\230\141\162\231\191\187\232\175\145\230\186\144\227\128\130"
    end
    local value = decoded(response)
    if not value or type(value[1]) ~= "table" then return nil, "\231\191\187\232\175\145\230\156\141\229\138\161\232\191\148\229\155\158\230\160\188\229\188\143\229\188\130\229\184\184\239\188\140\232\175\183\231\168\141\229\144\142\233\135\141\232\175\149\227\128\130" end
    local parts = {}
    for _, item in ipairs(value[1]) do
        if type(item) == "table" and type(item[1]) == "string" then parts[#parts + 1] = item[1] end
    end
    local result = table.concat(parts)
    if result == "" then return nil, "\231\191\187\232\175\145\230\156\141\229\138\161\230\156\170\232\191\148\229\155\158\230\150\135\229\173\151\227\128\130" end
    return result
end

local function marked_batch(texts)
    local parts = {}
    for i, text in ipairs(texts) do
        if text:find("\226\159\166HJ_", 1, true) then return nil end
        parts[#parts + 1] = string.format("\226\159\166HJ_%02d\226\159\167\n%s", i, text)
    end
    parts[#parts + 1] = "\226\159\166HJ_END\226\159\167"
    local translated, err = google_one(table.concat(parts, "\n"))
    if not translated then return nil, err end
    local output, position = {}, 1
    for i = 1, #texts do
        local a, b = translated:find(string.format("\226\159\166HJ_%02d\226\159\167", i), position, true)
        if not a or translated:sub(position, a - 1):match("%S") then return nil end
        local next_marker = i == #texts and "\226\159\166HJ_END\226\159\167" or string.format("\226\159\166HJ_%02d\226\159\167", i + 1)
        local next_pos = translated:find(next_marker, b + 1, true)
        if not next_pos then return nil end
        local text = translated:sub(b + 1, next_pos - 1):gsub("^%s+", ""):gsub("%s+$", "")
        if text == "" or text:find("\226\159\166HJ_", 1, true) then return nil end
        if texts[i]:sub(-1) == "\n" then text = text .. "\n" end
        output[i], position = text, next_pos
    end
    if translated:sub(position):gsub("%s+$", "") ~= "\226\159\166HJ_END\226\159\167" then return nil end
    return output
end

function engines.google(texts)
    if #texts > 1 then
        local result, err = marked_batch(texts)
        if result or err then return result, err end
    end
    local output = {}
    for i, text in ipairs(texts) do
        local result, err = google_one(text)
        if not result then return output, err end
        output[i] = result
    end
    return output
end

-- These optional sources are explicitly English -> Simplified Chinese.
-- Refuse known other scripts instead of sending an incorrect source-language claim.
local function english(text)
    if not text:find("%a") then return false end
    for _, cp in codepoints(text) do
        if (cp >= 0x3040 and cp <= 0x30ff) or (cp >= 0x400 and cp <= 0x52f) or (cp >= 0xac00 and cp <= 0xd7af) then return false end
    end
    return true
end

local function byte_chunks(text)
    local parts, start = {}, 1
    while start <= #text do
        local last = math.min(start + 449, #text)
        if last < #text then
            while last >= start and text:byte(last + 1) >= 128 and text:byte(last + 1) < 192 do last = last - 1 end
            local tail = text:sub(start, last)
            local boundary = tail:match(".*()%s")
            if boundary and boundary > #tail / 2 then last = start + boundary - 1 end
        end
        parts[#parts + 1] = text:sub(start, last)
        start = last + 1
    end
    return parts
end

local function entities(text)
    return (text:gsub("&#(%d+);", function(n)
        local ok, value = pcall(unicode_char, tonumber(n))
        return ok and value or "&#" .. n .. ";"
    end):gsub("&quot;", '"'):gsub("&#39;", "'"):gsub("&lt;", "<"):gsub("&gt;", ">"):gsub("&amp;", "&"))
end

function engines.mymemory(texts)
    local err = cooling("mymemory")
    if err then return nil, "MyMemory\239\188\154" .. err end
    local output = {}
    for i, text in ipairs(texts) do
        if not english(text) then return nil, "MyMemory \229\164\135\231\148\168\230\186\144\231\155\174\229\137\141\228\187\133\230\148\175\230\140\129\232\139\177\232\175\173\229\136\176\231\174\128\228\189\147\228\184\173\230\150\135\239\188\140\232\175\183\230\148\185\231\148\168 Google\227\128\130" end
        local pieces = {}
        for _, chunk in ipairs(byte_chunks(text)) do
            local response = perform("https://api.mymemory.translated.net/get?langpair=en%7Czh-CN&q=" .. encode(chunk), options(5))
            local value = decoded(response)
            local status = response and response.status or 0
            if value and tonumber(value.responseStatus) then status = tonumber(value.responseStatus) end
            if status ~= 200 then
                cooldown.mymemory = os.time() + ((status == 403) and 3600 or 60)
                cooldown_reason.mymemory = "MyMemory \230\154\130\228\184\141\229\143\175\231\148\168\230\136\150\229\133\141\232\180\185\233\162\157\229\186\166\229\183\178\231\148\168\229\174\140\239\188\136" .. status .. "\239\188\137\227\128\130"
                return output, "MyMemory \230\154\130\228\184\141\229\143\175\231\148\168\230\136\150\229\133\141\232\180\185\233\162\157\229\186\166\229\183\178\231\148\168\229\174\140\239\188\136" .. status .. "\239\188\137\227\128\130\229\143\175\229\136\135\230\141\162 Google \230\136\150\230\156\172\229\156\176\230\168\161\229\158\139\227\128\130"
            end
            local result = value and type(value.responseData) == "table" and value.responseData.translatedText
            if type(result) ~= "string" or result == "" or result:find("MYMEMORY WARNING", 1, true) then
                return nil, "MyMemory \232\191\148\229\155\158\230\160\188\229\188\143\229\188\130\229\184\184\230\136\150\233\162\157\229\186\166\228\184\141\232\182\179\239\188\140\232\175\183\229\136\135\230\141\162\231\191\187\232\175\145\230\186\144\227\128\130"
            end
            pieces[#pieces + 1] = entities(result)
        end
        output[i] = table.concat(pieces)
    end
    return output
end

function engines.offline(texts)
    for _, text in ipairs(texts) do
        if not english(text) then return nil, "\230\156\172\229\156\176\230\168\161\229\158\139\231\155\174\229\137\141\228\187\133\230\148\175\230\140\129\232\139\177\232\175\173\229\136\176\231\174\128\228\189\147\228\184\173\230\150\135\227\128\130" end
    end
    local opts = options(8)
    opts.proxy = ""
    opts.headers = { ["Content-Type"] = "application/json" }
    -- Use the generic API: the pinned framework's POST convenience wrapper does
    -- not forward its constructed options at Lua stack index 2.
    opts.method = "POST"
    opts.data = json.encode({ texts = texts })
    local response = perform("http://127.0.0.1:17653/translate", opts)
    local value = decoded(response)
    if not response or response.status ~= 200 or not value or value.ok ~= true or type(value.items) ~= "table" or #value.items ~= #texts then
        return nil, "\230\156\172\229\156\176\230\168\161\229\158\139\230\156\170\229\176\177\231\187\170\227\128\130\232\175\183\229\156\168\229\174\137\232\163\133\229\140\133\228\184\173\232\191\144\232\161\140\227\128\140\229\174\137\232\163\133\231\166\187\231\186\191\231\191\187\232\175\145.cmd\227\128\141\228\184\139\232\189\189\230\168\161\229\158\139\239\188\140\229\134\141\232\191\144\232\161\140\227\128\140\229\144\175\229\138\168\231\166\187\231\186\191\231\191\187\232\175\145.cmd\227\128\141\227\128\130\232\175\141\229\186\147\230\168\161\229\188\143\230\151\160\233\156\128\229\174\137\232\163\133\230\168\161\229\158\139\227\128\130"
    end
    local output = {}
    for i, item in ipairs(value.items) do
        if type(item) ~= "table" or item.ok ~= true or type(item.text) ~= "string" or item.text == "" then return nil, "\230\156\172\229\156\176\230\168\161\229\158\139\232\191\148\229\155\158\230\160\188\229\188\143\229\188\130\229\184\184\227\128\130" end
        output[i] = item.text
    end
    return output
end

return engines
