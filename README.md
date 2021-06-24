# picoCTF v8 Turboflan challenge

Solution to the [v8 Turboflan challenge in picoCTF](https://play.picoctf.org/practice/challenge/178). Start reading in step1-fl_read for an explanation, then step2, step3, and step4 is just applying something from [another picoCTF v8 CTF (Horsepower)](https://github.com/nico-abram/d8-horsepower)

NOTE: The files should (All except step4-exploit.js) be run using d8 with the `--allow-natives-syntax` to enable `%DebugPrint`
Using `%DebugPrint` lets you check against the expect pointers easily, without having to muck around in gdb so much
Example:

`./d8 step1-fl_read.js --allow-natives-syntax`

All the scripts end in an infinite loop, so that you can breakpoint if running in gdb

# Instructions

To send the exploit on windows:

`type .\step4-exploit.js | python .\send.py`

On linux:

`cat ./step4-exploit.js | python2 ./send.py`
