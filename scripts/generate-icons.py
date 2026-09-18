from pathlib import Path
import struct,zlib,math
BG=(0x17,0x33,0x3a,255);FG=(0xf7,0xf7,0xf3,255);ACCENT=(0xd9,0x69,0x55,255)
def crc(tag,data):return zlib.crc32(tag+data)&0xffffffff
def chunk(tag,data):return struct.pack('>I',len(data))+tag+data+struct.pack('>I',crc(tag,data))
def inside_tri(px,py,a,b,c):
 def s(p1,p2,p3):return (p1[0]-p3[0])*(p2[1]-p3[1])-(p2[0]-p3[0])*(p1[1]-p3[1])
 p=(px,py);d1=s(p,a,b);d2=s(p,b,c);d3=s(p,c,a);neg=(d1<0)or(d2<0)or(d3<0);pos=(d1>0)or(d2>0)or(d3>0);return not(neg and pos)
def png(size,maskable=False):
 scale=size/512;rows=[]
 for y in range(size):
  row=bytearray([0])
  for x in range(size):
   X=(x+.5)/scale;Y=(y+.5)/scale;c=BG
   outer=inside_tri(X,Y,(256,112),(126,398),(386,398));inner=inside_tri(X,Y,(256,223),(225,296),(287,296))
   if outer and not inner:c=FG
   # soften A legs with background under baseline and create crossbar gap-independent shape
   if 219<=X<=293 and 296<=Y<=334:c=FG
   if (X-374)**2+(Y-139)**2<=20**2:c=ACCENT
   row.extend(c)
  rows.append(bytes(row))
 raw=b''.join(rows);sig=b'\x89PNG\r\n\x1a\n';ihdr=struct.pack('>IIBBBBB',size,size,8,6,0,0,0)
 return sig+chunk(b'IHDR',ihdr)+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b'')
out=Path('public/icons');out.mkdir(parents=True,exist_ok=True)
(out/'icon-192.png').write_bytes(png(192));(out/'icon-512.png').write_bytes(png(512));(out/'icon-maskable-512.png').write_bytes(png(512,True))
