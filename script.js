
//Polyfill-------------------------------------------------------------------
var barebonesWASI = function() {
    var moduleInstanceExports = null;

    var WASI_ESUCCESS = 0;
    var WASI_EBADF = 8;
    var WASI_EINVAL = 28;
    var WASI_ENOSYS = 52;

    var WASI_STDOUT_FILENO = 1;

    function setModuleInstance(instance) {

        moduleInstanceExports = instance.exports;
    }

    function getModuleMemoryDataView() {
        // call this any time you'll be reading or writing to a module's memory 
        // the returned DataView tends to be dissaociated with the module's memory buffer at the will of the WebAssembly engine 
        // cache the returned DataView at your own peril!!

        return new DataView(moduleInstanceExports.memory.buffer);
    }

    function fd_prestat_get(fd, bufPtr) {

        return WASI_EBADF;
    }

    function fd_prestat_dir_name(fd, pathPtr, pathLen) {

         return WASI_EINVAL;
    }

    function environ_sizes_get(environCount, environBufSize) {

        var view = getModuleMemoryDataView();

        view.setUint32(environCount, 0, !0);
        view.setUint32(environBufSize, 0, !0);

        return WASI_ESUCCESS;
    }

    function environ_get(environ, environBuf) {

        return WASI_ESUCCESS;
    }

    function args_sizes_get(argc, argvBufSize) {

        var view = getModuleMemoryDataView();

        view.setUint32(argc, 0, !0);
        view.setUint32(argvBufSize, 0, !0);

        return WASI_ESUCCESS;
    }

     function args_get(argv, argvBuf) {

        return WASI_ESUCCESS;
    }

    function fd_fdstat_get(fd, bufPtr) {

        var view = getModuleMemoryDataView();

        view.setUint8(bufPtr, fd);
        view.setUint16(bufPtr + 2, 0, !0);
        view.setUint16(bufPtr + 4, 0, !0);

        function setBigUint64(byteOffset, value, littleEndian) {

            var lowWord = value;
            var highWord = 0;

            view.setUint32(littleEndian ? 0 : 4, lowWord, littleEndian);
            view.setUint32(littleEndian ? 4 : 0, highWord, littleEndian);
       }

        setBigUint64(bufPtr + 8, 0, !0);
        setBigUint64(bufPtr + 8 + 8, 0, !0);

        return WASI_ESUCCESS;
    }

    function fd_write(fd, iovs, iovsLen, nwritten) {

        var view = getModuleMemoryDataView();

        var written = 0;
        var bufferBytes = [];                   

        function getiovs(iovs, iovsLen) {
            // iovs* -> [iov, iov, ...]
            // __wasi_ciovec_t {
            //   void* buf,
            //   size_t buf_len,
            // }
            var buffers = Array.from({ length: iovsLen }, function (_, i) {
                   var ptr = iovs + i * 8;
                   var buf = view.getUint32(ptr, !0);
                   var bufLen = view.getUint32(ptr + 4, !0);

                   return new Uint8Array(moduleInstanceExports.memory.buffer, buf, bufLen);
                });

            return buffers;
        }

        var buffers = getiovs(iovs, iovsLen);
        function writev(iov) {

            for (var b = 0; b < iov.byteLength; b++) {

               bufferBytes.push(iov[b]);
            }

            written += b;
        }

        buffers.forEach(writev);

        if (fd === WASI_STDOUT_FILENO) console.log(String.fromCharCode.apply(null, bufferBytes));                            

        view.setUint32(nwritten, written, !0);

        return WASI_ESUCCESS;
    }

    function poll_oneoff(sin, sout, nsubscriptions, nevents) {

        return WASI_ENOSYS;
    }

    function proc_exit(rval) {

        return WASI_ENOSYS;
    }

    function fd_close(fd) {

        return WASI_ENOSYS;
    }

    function fd_seek(fd, offset, whence, newOffsetPtr) {

    }

    function fd_close(fd) {

        return WASI_ENOSYS;
    }

    return {
        setModuleInstance : setModuleInstance,
        environ_sizes_get : environ_sizes_get,
        args_sizes_get : args_sizes_get,
        fd_prestat_get : fd_prestat_get,
        fd_fdstat_get : fd_fdstat_get,
        fd_write : fd_write,
        fd_prestat_dir_name : fd_prestat_dir_name,
        environ_get : environ_get,
        args_get : args_get,
        poll_oneoff : poll_oneoff,
        proc_exit : proc_exit,
        fd_close : fd_close,
        fd_seek : fd_seek,
    }               
}

//End Polyfill---------------------------------------------------------------



window.addEventListener('load', main);

async function main(){
	//globals
	const canvas = document.getElementById('c');
	const rect = canvas.getBoundingClientRect();

	let clicked = false;

	var ctx = canvas.getContext('2d');
	console.log(ctx);

	const width = 500;
	const height = 500;

	const byteSize = height * width * 4;

	var points = [];

	var currentBrushR;

	//init system
	const b2p = function bytesToPages(bytes) { return Math.ceil(bytes / 64_000); }
	const memory = new WebAssembly.Memory({initial: 1000});
	let resp = await fetch("buffer.wasm");
	let bytes = await resp.arrayBuffer();

	const poly = new barebonesWASI()
	const { instance } = await WebAssembly.instantiate(bytes, {
		env: { memory },
		wasi_snapshot_preview1: poly,
		consoleLog: console.log,
	});
	

	var pointer = instance.exports.allocate(width, height);
	instance.exports.initSystem();


	//testing only
	instance.exports.blendLayers();
	var usub = new Uint8ClampedArray(memory.buffer, pointer, byteSize);
	img = new ImageData(usub, width, height);
	ctx.putImageData(img, 0, 0);

	//function handlers here 
	var img;
	
	const colorPicker = document.getElementById('brushC');
	function updateColor(){
		const hexValue = colorPicker.value.substring(1);
		const aRgbHex = hexValue.match(/.{1,2}/g);  

		const r = parseInt(aRgbHex[0], 16);
        const g = parseInt(aRgbHex[1], 16); //rgb 
        const b = parseInt(aRgbHex[2], 16);

        instance.exports.setColor(r, g, b);
	}
	updateColor();

	const brushButton = document.getElementById("paintbrush");
	const eraserButton = document.getElementById("eraser");
	var currentTool; //0=paintbrush 1=eraser
	function readRadio(){
		console.log(eraserButton);
		console.log(brushButton);
		if(brushButton.checked){
			updateColor();
			currentTool = 0;

		}
		if(eraserButton.checked){
			instance.exports.setColor(255, 255, 255);
			currentTool = 1;
		}

		instance.exports.setBrushRadius(currentBrushR,currentTool)
	}
	readRadio();

	const sizeSlider = document.getElementById('myRange');
	const sizeStatus = document.getElementById('size');
	function updateSize(){
		sizeStatus.innerHTML = sizeSlider.value;
		currentBrushR = sizeSlider.value;
		instance.exports.setBrushRadius(sizeSlider.value, currentTool);
	}
	updateSize();

	canvas.addEventListener('mousedown', function(e){
		let x = (event.clientX - rect.left);
    	let y = (event.clientY - rect.top);

		clicked = true;
		instance.exports.startPath(x, y);
	});

	canvas.addEventListener('mouseup', function(e){
		var usub = new Uint8ClampedArray(memory.buffer, pointer, byteSize);
		img = new ImageData(usub, width, height);
		ctx.putImageData(img, 0, 0);

		clicked = false;
		instance.exports.endPath();
	});

	canvas.addEventListener('mousemove', function (e) {
		let x = event.clientX - rect.left;
    	let y = event.clientY - rect.top;

    	instance.exports.setOverlay(x, y);

    	if(clicked){
    		points.push([x, y]);

    		if(points.length > 1){
    			var ax = 0;
    			var ay = 0;
    			for(let i = 0; i < points.length; i++){
    				ax += points[i][0];
    				ay += points[i][1];
    			}
    			ax /= points.length;
    			ay /= points.length;

    			instance.exports.addPoint(x, y);

    			points = [];

    			
    		}
    	} 

    	instance.exports.blendLayers();

    	var usub = new Uint8ClampedArray(memory.buffer, pointer, byteSize);
		img = new ImageData(usub, width, height);
		ctx.putImageData(img, 0, 0);
  	});

  	canvas.addEventListener('mouseleave', function(e){
  		if(clicked){
			clicked = false;
			instance.exports.endPath();
  		}

  		instance.exports.clearOverlay();
  		instance.exports.blendLayers();

    	var usub = new Uint8ClampedArray(memory.buffer, pointer, byteSize);
		img = new ImageData(usub, width, height);
		ctx.putImageData(img, 0, 0);
  	});
	
	//instance.exports.dealloc();

	const clearBtn = document.getElementById('clear');
	clearBtn.addEventListener('click', function(e) {
		instance.exports.clearScreen();

		var usub = new Uint8ClampedArray(memory.buffer, pointer, byteSize);
		img = new ImageData(usub, width, height);
		ctx.putImageData(img, 0, 0);
	});

	sizeSlider.addEventListener('change', function(e) {
		updateSize();
	});

	colorPicker.addEventListener('change', function(e){
		updateColor();
	})

	brushButton.addEventListener('change', readRadio);
	eraserButton.addEventListener('change', readRadio);
}