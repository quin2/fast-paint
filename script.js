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

	const { instance } = await WebAssembly.instantiate(bytes, {
		env: { memory }
	});

	var pointer = instance.exports.allocate(width, height);
	instance.exports.initSystem();

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
		clicked = false;
		instance.exports.endPath();

		var usub = new Uint8ClampedArray(memory.buffer, pointer, byteSize);
		img = new ImageData(usub, width, height);
		ctx.putImageData(img, 0, 0);

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