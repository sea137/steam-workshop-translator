local json = require("json")
local fs = require("fs")
local millennium = require("millennium")
local engines = require("engines")
local starter = require("glossary")
local cache, cache_count, loaded = {}, 0, false
local dictionary
local root = millennium.steam_path() .. "/millennium/config/"
local cache_file = root .. "workshop-translator-cache.json"
local dictionary_file = root .. "haijing-dictionary.json"
local valid_sources = { auto = true, google = true, mymemory = true, offline = true, dictionary = true }

local function read_json(path, limit)
    local file = io.open(path, "rb")
    if not file then return nil end
    local bytes = file:read(limit + 1); file:close()
    if #bytes > limit then return nil end
    local ok, value = pcall(json.decode, bytes)
    if ok and type(value) == "table" then return value end
end

local function normalize(text)
    return text:lower():gsub("^%s+", ""):gsub("%s+$", ""):gsub("%s+", " ")
end

local function load_cache()
    if loaded then return end
    loaded = true
    local value = read_json(cache_file, 8000000)
    if not value then return end
    -- Migrate old Google-only caches without attributing them to another source.
    local entries = value.version == 2 and value.entries or value
    if type(entries) ~= "table" then return end
    for k, v in pairs(entries) do
        if type(k) == "string" and type(v) == "string" and cache_count < 1500 then
            local key = value.version == 2 and k or "google:" .. k
            cache[key], cache_count = v, cache_count + 1
        end
    end
end

local function save_cache()
    fs.create_directories(root)
    local file = io.open(cache_file, "wb")
    if file then file:write(json.encode({ version = 2, entries = cache })); file:close() end
end

local function remember(provider, text, translation)
    if cache_count >= 1500 then cache = {}; cache_count = 0 end
    local key = provider .. ":" .. text
    if not cache[key] then cache_count = cache_count + 1 end
    cache[key] = translation
end

local function glossary()
    if dictionary then return dictionary end
    dictionary = {}
    for k, v in pairs(starter) do dictionary[normalize(k)] = v end
    local custom = read_json(dictionary_file, 2000000)
    if custom then
        for k, v in pairs(custom) do
            if type(k) == "string" and type(v) == "string" then dictionary[normalize(k)] = v end
        end
    end
    return dictionary
end

local function item(provider, text, cached)
    return { ok = true, text = text, provider = provider, kind = provider == "dictionary" and "dictionary" or "translation", cached = cached }
end

---@ffi
---@param payload string
---@return string
function translateTexts(payload)
    if type(payload) ~= "string" or #payload > 30000 then return json.encode({ ok = false, error = "\231\191\187\232\175\145\232\175\183\230\177\130\232\191\135\229\164\167\227\128\130" }) end
    local ok, value = pcall(json.decode, payload)
    if not ok or type(value) ~= "table" then return json.encode({ ok = false, error = "\231\191\187\232\175\145\232\175\183\230\177\130\230\160\188\229\188\143\229\188\130\229\184\184\227\128\130" }) end
    -- Legacy clients submit an array and keep their Google-only behavior.
    local texts, provider = value.texts or value, value.texts and value.provider or "google"
    if type(texts) ~= "table" or #texts < 1 or #texts > 8 or not valid_sources[provider] then
        return json.encode({ ok = false, error = "\231\191\187\232\175\145\232\175\183\230\177\130\230\160\188\229\188\143\229\188\130\229\184\184\230\136\150\231\191\187\232\175\145\230\186\144\230\151\160\230\149\136\227\128\130" })
    end
    for _, text in ipairs(texts) do
        if type(text) ~= "string" or #text == 0 or #text > 7000 then return json.encode({ ok = false, error = "\230\150\135\230\156\172\228\184\186\231\169\186\230\136\150\232\191\135\233\149\191\239\188\140\232\175\183\229\136\183\230\150\176\233\161\181\233\157\162\229\144\142\233\135\141\232\175\149\227\128\130" }) end
    end
    load_cache()
    engines.begin_request()
    local chain = provider == "auto" and { "offline", "google", "mymemory", "dictionary" } or { provider }
    local results, seen, pending = {}, {}, {}
    for _, text in ipairs(texts) do
        if not seen[text] then pending[#pending + 1] = text; seen[text] = true end
    end
    -- Use existing results before contacting any external service.
    for _, id in ipairs(chain) do
        for _, text in ipairs(pending) do
            local cached = id ~= "dictionary" and cache[id .. ":" .. text]
            if not results[text] and cached then results[text] = item(id, cached, true) end
        end
    end
    local errors, changed = {}, false
    for _, id in ipairs(chain) do
        local missing = {}
        for _, text in ipairs(pending) do if not results[text] then missing[#missing + 1] = text end end
        if #missing == 0 then break end
        if id == "dictionary" then
            local words = glossary()
            for _, text in ipairs(missing) do
                local match = words[normalize(text)]
                if match then results[text] = item("dictionary", match, true) end
            end
            errors[#errors + 1] = "\230\156\172\229\156\176\232\175\141\229\186\147\230\156\170\229\145\189\228\184\173\239\188\155\232\175\141\229\186\147\229\143\170\229\140\185\233\133\141\229\174\140\230\149\180\232\175\141\230\157\161\239\188\140\228\184\141\232\131\189\231\191\187\232\175\145\228\187\187\230\132\143\230\149\180\229\143\165\227\128\130"
        else
            local success, translated, err = pcall(engines[id], missing)
            if not success then translated, err = nil, "\231\191\187\232\175\145\230\156\141\229\138\161\230\154\130\228\184\141\229\143\175\231\148\168\239\188\140\232\175\183\229\136\135\230\141\162\231\191\187\232\175\145\230\186\144\230\136\150\231\168\141\229\144\142\233\135\141\232\175\149\227\128\130" end
            if translated then
                for i, text in ipairs(missing) do
                    if type(translated[i]) == "string" and translated[i] ~= "" then
                        results[text] = item(id, translated[i], false)
                        remember(id, text, translated[i]); changed = true
                    end
                end
            end
            if err or not translated then errors[#errors + 1] = err or "\231\191\187\232\175\145\230\156\141\229\138\161\230\156\170\232\191\148\229\155\158\230\150\135\229\173\151\227\128\130" end
        end
    end
    if changed then save_cache() end
    local output = {}
    for i, text in ipairs(texts) do
        output[i] = results[text] or { ok = false, error = table.concat(errors, "\n") }
    end
    return json.encode({ ok = true, items = output })
end

---@ffi
---@param text string
---@return string
function translateText(text)
    if type(text) ~= "string" or #text == 0 or #text > 7000 then return json.encode({ ok = false, error = "\230\150\135\230\156\172\228\184\186\231\169\186\230\136\150\232\191\135\233\149\191\239\188\140\232\175\183\229\136\183\230\150\176\233\161\181\233\157\162\229\144\142\233\135\141\232\175\149\227\128\130" }) end
    local response = json.decode(translateTexts(json.encode({ text })))
    return json.encode(response.items and response.items[1] or response)
end

---@ffi
---@param payload string
---@return string
function importDictionary(payload)
    if type(payload) ~= "string" or #payload > 2000000 then return json.encode({ ok = false, error = "\232\175\141\229\186\147\228\184\141\232\131\189\232\182\133\232\191\135 2 MB\227\128\130" }) end
    local ok, value = pcall(json.decode, payload)
    if not ok or type(value) ~= "table" then return json.encode({ ok = false, error = "\232\175\183\229\175\188\229\133\165 JSON \230\160\188\229\188\143\231\154\132\232\175\141\229\186\147\227\128\130" }) end
    local input, output, count = value.entries or value, {}, 0
    if type(input) ~= "table" then return json.encode({ ok = false, error = "\232\175\141\229\186\147\230\160\188\229\188\143\230\151\160\230\149\136\227\128\130" }) end
    for k, v in pairs(input) do
        if type(k) ~= "string" or type(v) ~= "string" or #k == 0 or #k > 7000 or #v == 0 or #v > 14000 or not v:find("%S") then
            return json.encode({ ok = false, error = "\232\175\141\229\186\147\229\191\133\233\161\187\230\152\175\229\142\159\230\150\135\229\136\176\232\175\145\230\150\135\231\154\132\230\150\135\229\173\151\230\152\160\229\176\132\227\128\130" })
        end
        local key = normalize(k)
        if key == "" then return json.encode({ ok = false, error = "\232\175\141\229\186\147\228\184\141\232\131\189\230\156\137\231\169\186\232\175\141\230\157\161\227\128\130" }) end
        output[key], count = v, count + 1
        if count > 10000 then return json.encode({ ok = false, error = "\232\175\141\229\186\147\230\156\128\229\164\154\230\148\175\230\140\129 10000 \228\184\170\232\175\141\230\157\161\227\128\130" }) end
    end
    if count == 0 then return json.encode({ ok = false, error = "\232\175\141\229\186\147\230\178\161\230\156\137\232\175\141\230\157\161\227\128\130" }) end
    fs.create_directories(root)
    local file = io.open(dictionary_file, "wb")
    if not file then return json.encode({ ok = false, error = "\232\175\141\229\186\147\228\191\157\229\173\152\229\164\177\232\180\165\239\188\140\232\175\183\230\163\128\230\159\165 Steam \231\155\174\229\189\149\230\157\131\233\153\144\227\128\130" }) end
    local written = file:write(json.encode(output)); file:close()
    if not written then return json.encode({ ok = false, error = "\232\175\141\229\186\147\228\191\157\229\173\152\229\164\177\232\180\165\227\128\130" }) end
    dictionary = nil
    return json.encode({ ok = true, count = count })
end

---@ffi
---@return boolean
function clearTranslationCache()
    loaded, cache, cache_count = true, {}, 0
    save_cache()
    return true
end

---@ffi
---@return string
function prepareOffline()
    return json.encode(require("offline_runtime").prepare())
end
