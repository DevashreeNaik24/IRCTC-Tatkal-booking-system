-- releaseSeat.lua
-- Atomic seat release + waitlist promotion
-- KEYS[1] = inventory key (e.g., "inventory:1:2025-08-15:AC3")
-- KEYS[2] = waitlist key (e.g., "waitlist:1:2025-08-15:AC3")
-- ARGV[1] = hold TTL for promoted user (seconds)
--
-- Returns: {action, promotedBookingId_or_nil, remainingSeats}
--   action: 1 = seat returned to pool, 2 = seat given to waitlisted user
--   promotedBookingId: the booking ID that was promoted (or "none")
--   remainingSeats: seats available after this operation

local inventoryKey = KEYS[1]
local waitlistKey = KEYS[2]
local holdTTL = tonumber(ARGV[1])

-- Check if anyone is on the waitlist
local waitlistResult = redis.call("ZPOPMIN", waitlistKey)

if #waitlistResult == 0 then
  -- No one on waitlist — return seat to pool
  local remaining = redis.call("INCRBY", inventoryKey, 1)
  return {1, "none", remaining}
else
  -- Someone on waitlist — give seat directly to them
  local promotedBookingId = waitlistResult[1]

  -- Create a new hold for the promoted booking
  local holdKey = "hold:" .. promotedBookingId
  redis.call("SET", holdKey, promotedBookingId, "EX", holdTTL)

  -- Seats don't change (released one, immediately allocated another)
  local remaining = tonumber(redis.call("GET", inventoryKey)) or 0

  return {2, promotedBookingId, remaining}
end
