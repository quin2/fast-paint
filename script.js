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
	var currentBrushAlpha;
	var eraseMode;

	//init system
	const b2p = function bytesToPages(bytes) { return Math.ceil(bytes / 64_000); }
	const memory = new WebAssembly.Memory({initial: 1000});
	let resp = await fetch("buffer.wasm");
	let bytes = await resp.arrayBuffer();

	const { instance } = await WebAssembly.instantiate(bytes, {
		env: { memory }
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
	
	//color selection control
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

	//brush selection control
	const circleButton = document.getElementById("circlebrush");
	const squareButton = document.getElementById("squarebrush")
	var currentTool; //0=paintbrush 1=eraser
	function readRadio(){
		if(circleButton.checked){
			updateColor();
			currentTool = 0;

		}
		if(squareButton.checked){
			updateColor();
			currentTool = 1;
		}

		instance.exports.setBrushProperties(currentBrushR, currentTool, currentBrushAlpha, eraseMode);
	}
	readRadio();

	//erase mode control (v2)
	const eraseModeCheckbox = document.getElementById("eraseMode");
	function readEraseMode(){
		if(eraseModeCheckbox.checked){
			eraseMode = 1;
		} else {
			eraseMode = 0;
		}

		//do this as a hack, to init a full refresh of all properties. Will have to refactor later
		readRadio();
	}
	readEraseMode();

	//size control
	const sizeSlider = document.getElementById('sizeSlider');
	const sizeStatus = document.getElementById('size');
	function updateSize(){
		currentBrushR = sizeSlider.value;
		sizeStatus.innerHTML = currentBrushR;
		
		instance.exports.setBrushProperties(currentBrushR, currentTool, currentBrushAlpha, eraseMode);
	}
	updateSize();

	//alpha control
	const alphaSlider = document.getElementById('alphaSlider');
	const alphaStatus = document.getElementById('alpha');
	function updateAlpha(){
		currentBrushAlpha = alphaSlider.value;
		alphaStatus.innerHTML = currentBrushAlpha;
		
		instance.exports.setBrushProperties(currentBrushR, currentTool, currentBrushAlpha, eraseMode);
	}
	updateAlpha();

	canvas.addEventListener('mousedown', function(e){
		let x = (event.clientX - rect.left);
    	let y = (event.clientY - rect.top);

		clicked = true;
		instance.exports.startPath(x, y);
		instance.exports.blendLayers();
	});

	canvas.addEventListener('mouseup', function(e){
		var usub = new Uint8ClampedArray(memory.buffer, pointer, byteSize);
		img = new ImageData(usub, width, height);
		ctx.putImageData(img, 0, 0);

		clicked = false;
		instance.exports.endPath();
	});

	canvas.addEventListener('mousemove', (e) => drawOnCanvas(e));

	function drawOnCanvas(event){
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
	}

	

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

	alphaSlider.addEventListener('change', function(e) {
		updateAlpha();
	});

	colorPicker.addEventListener('change', function(e){
		updateColor();
	})

	circleButton.addEventListener('change', readRadio);
	squareButton.addEventListener('change', readRadio);

	eraseModeCheckbox.addEventListener('change', readEraseMode);	
}