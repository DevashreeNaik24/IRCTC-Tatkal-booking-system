-- admitUser.lua
-- Token-bucket based admission control for waiting room
-- KEYS[1] = admission counter key ("admission:active_count")
-- KEYS[2] = admission queue key ("admission:queue:{trainId}:{date}:{class}")
-- ARGV[1] = max concurrent bookings
-- ARGV[2] = user ID
-- ARGV[3] = admission token
-- ARGV[4] = token TTL in seconds
--
-- Returns: {status, position_or_token}
--   status: 1 = admitted (token granted), 0 = queued (position returned)

local counterKey = KEYS[1]
local queueKey = KEYS[2]
local maxConcurrent = tonumber(ARGV[1])
local userId = ARGV[2]
local token = ARGV[3]
local tokenTTL = tonumber(ARGV[4])

-- Get current active count
local activeCount = tonumber(redis.call("GET", counterKey)) or 0

if activeCount < maxConcurrent then
  -- Under capacity — admit immediately
  redis.call("INCR", counterKey)

  -- Create admission token
  local tokenKey = "admission:token:" .. token
  local tokenData = '{"userId":' .. userId .. ',"grantedAt":' .. redis.call("TIME")[1] .. '}'
  redis.call("SET", tokenKey, tokenData, "EX", tokenTTL)

  return {1, token}
else
  -- Over capacity — add to queue
  local score = tonumber(redis.call("TIME")[1]) * 1000 + tonumber(redis.call("TIME")[2])
  redis.call("ZADD", queueKey, score, userId)
  local position = redis.call("ZRANK", queueKey, userId)

  return {0, position}
end
