-- reserveSeat.lua
-- Atomic seat reservation: check inventory → decrement → create hold
-- KEYS[1] = inventory key (e.g., "inventory:1:2025-08-15:AC3")
-- KEYS[2] = hold key (e.g., "hold:<bookingId>")
-- ARGV[1] = hold TTL in seconds
-- ARGV[2] = booking ID
-- ARGV[3] = user ID
--
-- Returns: {status, remainingSeats}
--   status: 1 = reserved, 0 = sold out
--   remainingSeats: number of seats remaining after this operation

local inventoryKey = KEYS[1]
local holdKey = KEYS[2]
local holdTTL = tonumber(ARGV[1])
local bookingId = ARGV[2]
local userId = ARGV[3]

-- Check if user already has a hold for this inventory (prevent double-booking)
local userHoldKey = "user_hold:" .. userId .. ":" .. inventoryKey
local existingHold = redis.call("GET", userHoldKey)
if existingHold then
  return {-1, 0} -- User already has a hold, return error code -1
end

-- Get current available seats
local available = tonumber(redis.call("GET", inventoryKey))

if available == nil then
  return {-2, 0} -- Inventory not initialized, return error code -2
end

if available <= 0 then
  return {0, 0} -- Sold out
end

-- Atomic decrement
local remaining = redis.call("DECRBY", inventoryKey, 1)

-- Create hold key with TTL
redis.call("SET", holdKey, bookingId, "EX", holdTTL)

-- Track user's active hold for this inventory
redis.call("SET", userHoldKey, bookingId, "EX", holdTTL)

return {1, remaining}
