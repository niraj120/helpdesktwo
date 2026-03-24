import re
data = open("MyTickets.tsx", "rb").read()
for m in re.finditer(b'icon: "(.{2,12})"', data):
    print("icon:", repr(m.group(1)), "=", m.group(1).decode("utf-8", errors="replace"))
for m in re.finditer(b'value="(online|offline|email)">(.{1,20})</option>', data):
    print("option:", m.group(2).decode("utf-8", errors="replace"))
