data = open("MyTickets.tsx", "rb").read()

fixes = [
    (b"\xc3\xb0\xc5\xb8\xc5\x92\xc2\x90",    "\U0001F310".encode("utf-8")),  # 🌐
    (b"\xc3\xb0\xc5\xb8\xe2\x80\x9c\xc2\x8d", "\U0001F4CD".encode("utf-8")),  # 📍
    (b"\xc3\xb0\xc5\xb8\xe2\x80\x9c\xc2\xa7", "\U0001F4E7".encode("utf-8")),  # 📧
    (b"\xc3\xb0\xc5\xb8\xc5\xbd\xc2\xaf",    "\U0001F3AF".encode("utf-8")),  # 🎯
    (b"\xc3\xb0\xc5\xb8\xc2\x8f\xc2\xa2",    "\U0001F3A2".encode("utf-8")),  # 🎢
]

result = data
for garbled, correct in fixes:
    count = result.count(garbled)
    result = result.replace(garbled, correct)
    print("Replaced", count, "x", correct.decode("utf-8"))

open("MyTickets.tsx", "wb").write(result)
print("Done.")
