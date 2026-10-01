# Prints this computer's LAN IPv4 address, so a phone on the same Wi-Fi can
# be told which URL to open. Loopback (127.x) and link-local (169.254.x)
# addresses are skipped because they do not work from another device.
#
# Used by ALLOW-PHONE-ACCESS.bat. Not needed to run the website.

$address = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
  Where-Object { $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object -First 1

if ($address) {
  Write-Output $address.IPAddress
  exit 0
}

Write-Error 'No usable network address found. Check your Wi-Fi is connected.'
exit 1
