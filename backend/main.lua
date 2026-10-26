local millennium = require("millennium")
local logger = require("logger")
require("translator")

return {
    on_load = function()
        logger:info("HaijingTools 0.3.3 ready")
        millennium.ready()
    end,
    on_unload = function() end
}
