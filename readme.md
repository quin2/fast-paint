# fast-paint

## fast-paint is a painting program for the web, built from the ground up in webassembly. 

### features
* dynamic canvas size
* anti-aliased brush with adjustable size
* eraser
* tool guides
* fast
* brush opacity
* layers
* canvas movement/scaling
* export

### future
* delete/change layer order
* export and import all layers
* variable width brushes
* image placement

## Why and How
I wanted to learn how digital painting programs like Photoshop and Clip Studio work. Figma is really good for graphic design, but there isn't a real equivalent for illustration on the web that is free. I started working in JavaScript at first, but it ended up being too slow, and array access to represent the canvas was really awful.

There is minimal use of JS, the heart of the code really runs in C. Initially, I allocate the buffers and calculate the brush mask size. When the user moves the mouse, points are added to the path stack. As the line grows, we calculate parametric line equation from the last point to the next one, and merge the brush mask into the brush buffer using a 1 pixel stride. When that line is complete, we calculate color, alpha and merge it into the screen buffer. When the "stroke" is over, we add the path we made into another buffer that is used to keep track of where we draw before. There is a seperate buffer that is always drawn 'over' the screen buffer that is used for the brush guides. Every time the user moves the mouse, we compile these layers into the canvas, which shares a memory address with JS.

On the JS end, we just hook into a minimal set of functions to add points to the path, clear buffers, and set brush parameters. The Webassembly side of things allocates memory for the canvas and passes the address through to JS so the browser knows which part of the memory to 'paint.'

There wasn't really any good tutorials or documentation on how to make this kind of thing, I relied on experimentation, and some websites for non-specific stuff I got caught up on, like alpha blending, how to draw an anti-alliased filled circle, and drawing to the canvas in WebAssembly. If you're trying to do something similar let me know, and I can help. The biggest pain was probably that 99.9% of all Webasm documentation online is about Rust. 

I didn't really use anything like Emscripten either, to keep binary sizes small, and because I wanted to learn about wasm/JS interop, not have it abstracted away from me. 

## Play
Host the repo folder contents from a static web server, or use the included python file to host.

## Building
This project was written in C with Wasi to handle memory allocation and other things. To build it, [go here](https://github.com/WebAssembly/wasi-sdk/releases) and get version 8. Newer versions create binaries that rely on additional polyfills to run in browsers correctly. Then, define the variables in make.