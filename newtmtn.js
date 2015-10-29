// Morgan Locks

$(document).ready(function() {

    /* TODO's: 
    - ensure correct scaling on phone
    - Larger text when zoomed out
    */

    var ismobile = mobileCheck();

	var canvas_base = $('#canvas_one');
    var canvas_two_base = $('#canvas_two');
    var canvas_three_base = $('#canvas_three');
	var canvas = canvas_base.get(0);
    var canvas_trace = canvas_two_base.get(0);
    var canvas_ball = canvas_three_base.get(0);
	var canvas_context = canvas.getContext("2d");
    var canvas_trace_context = canvas_trace.getContext("2d");
    var canvas_ball_context = canvas_ball.getContext("2d");

	var windowWidth = canvas_base.width();
	var windowHeight = canvas_base.height();
	canvas_base.attr('height', windowHeight).attr('width', windowWidth);

	var timeout = null;
	var mountain_image = $("#mtnimg").get(0);
    mountain_image.onload = function() {
        initialDraw();
    };

	$(window).resize(resizing);

    var startButton = $("#startAnimation");
    var stopButton = $("#stopAnimation");
    var resetButton = $("#reset");
    var pathButton = $("#pathButton");
    var speedSlider = $("#speed_slider");

    /*var earth_hit_audio = new Audio('effects/Rock Hit.mp3');
    var cannon_fire_audio = new Audio('effects/Shell Fire.mp3');
    var scream_audio = new Audio('effects/Wilhelm Scream.mp3');
    var space_audio = new Audio('effects/Leaving Earth.mp3'); // same as in original
    earth_hit_audio.load();
    cannon_fire_audio.load();
    scream_audio.load();
    space_audio.load();*/

    var earth_hit_audio = $("#rock_hit").get(0);
    var cannon_fire_audio = $("#cannon_fire").get(0);
    var scream_audio = $("#scream_sound").get(0);
    var space_audio = $("#escape_sound").get(0);

    // TODO/note: the audio shows noticeable lag in Safari. This is because Safari reloads the audio every time before playing it. Saves bandwith? I think not.

    var isRunning = false;
    var drawPath = false;

    var theBall = new ball();
    var count = 0;

    var reality_conversion = 7220; // (m/s) according to my calculations, that's about how fast the ball would have to actually go to orbit the earth from that height
                                    // obviously there's no mountain that tall, but hey, treat the picture as though it was to scale!
    var reality_radius = 6371; // ~radius of the earth (km)
    var h_conversion = reality_radius / (153);
    var mountain_height = reality_radius * 1.2; // the mountain extends to 1.2 the radius of the earth

    var nominal_speed = Number(speedSlider.val());
    var speed = nominal_speed / reality_conversion;
    document.getElementById("splabel").innerHTML = "Initial Velocity: " + Number(speedSlider.val()) + " m/s";

    document.getElementById("velspan").innerHTML = "Current Velocity: 0 m/s";
    document.getElementById("distspan").innerHTML = "Elevation: " + Math.round(mountain_height) + " km";

    var crashed = true;

    resizing();

    function resizing(){
		windowWidth = canvas_base.width();
		windowHeight = canvas_base.height();
		canvas_base.attr('height', windowHeight).attr('width', windowWidth);
        canvas_two_base.attr('height', windowHeight).attr('width', windowWidth);
        canvas_three_base.attr('height', windowHeight).attr('width', windowWidth);

        if(!ismobile){
            // on mobile, we want the explanation to be the same width as everything else.
            // on larger browsers, it should be wider so it's easier to read.
            div0 = $("#explanation");
            div0.css({"width": 900});
        }

        initialDraw();
		halt();
		restart();
    }

    function initialDraw(){
        canvas_context.beginPath();
        canvas_context.rect(0, 0, windowWidth, windowHeight);
        canvas_context.fillStyle = "rgb(255, 255, 255)";
        canvas_context.fill();

        canvas_context.drawImage(mountain_image, 10, -16, windowWidth - 12, windowHeight);
    }

    function draw(){
        var cx = windowWidth / 2;// - 10; // accounts for offset of the location of the mountain in the image, const
        var cy = windowHeight / 2;

       //debugCircle(cx, cy);

       var ballColor = "rgb(0, 250, 0)";

       if(drawPath){
            canvas_trace_context.beginPath();
            canvas_trace_context.arc(theBall.x + cx, cy - theBall.y, 1.5, 0, Math.PI * 2);
            canvas_trace_context.fillStyle = ballColor;
            canvas_trace_context.fill();
       }

    	// draw the ball
        canvas_ball_context.clearRect(0, 0, windowWidth, windowHeight);

    	canvas_ball_context.beginPath();
    	canvas_ball_context.arc(theBall.x + cx, cy - theBall.y, 6, 0, Math.PI * 2);
		canvas_ball_context.fillStyle = "rgb(0, 0, 0)";
		canvas_ball_context.fill();
    	canvas_ball_context.beginPath();
    	canvas_ball_context.arc(theBall.x + cx, cy - theBall.y, 5, 0, Math.PI * 2);
		canvas_ball_context.fillStyle = ballColor;
		canvas_ball_context.fill();
    }

    function debugCircle(cx, cy){ // used to check the validity of the orbit
        canvas_context.beginPath();
        canvas_context.arc(cx, cy, 153, 0, Math.PI * 2);
        canvas_context.fillStyle = "rgb(0, 255, 0)";
        canvas_context.fill();
        canvas_context.beginPath();
        canvas_context.arc(cx, cy, 152, 0, Math.PI * 2);
        canvas_context.fillStyle = "rgb(250, 250, 250)";
        canvas_context.fill();
    }

    function run(){
		if(isRunning){
            computeNextStep();
            var dist = Math.sqrt((theBall.x - 14) * (theBall.x - 14) + (theBall.y - 178) * (theBall.y - 178)); // distance from mountain peak
            if(count > 50 && dist < 3){
                crash(scream_audio);
            }
            dist = Math.sqrt((theBall.x) * (theBall.x) + (theBall.y) * (theBall.y));
            if(dist < 153){
                crash(earth_hit_audio);
            }
            if(nominal_speed > 8600 && theBall.x > 256){
                // call it an escape (although the actual escape velocity is something like 10200 m/s);
                crash(space_audio);
            }
			draw();
		}

		if(isRunning){
			timeout = setTimeout(function(){ run() }, 5);
		} else {
			timeout = setTimeout(function(){ run() }, 250);
		}
    }

    function computeNextStep() {
        var sf = .1; // scaling factor
        var G = 2000; // strength of gravity
        // these two numbers determine the speed and shape of the orbit
        // if sf is high, orbit goes faster and wider. When sf is low, orbit is slow and tighter
        // when G is high, orbit is same speed, but tighter. When G is low, orbit is wider.
        // adjust sf to get the right speed, then adjust G to get the right size.

        count++;

        // the focus of this ellipse is at 0,0, so the x distance is always equal to x. Same with dy.
        var angle = Math.atan(theBall.y / theBall.x);
        if (theBall.x < 0){
            angle += Math.PI; // atan only covers half a circle without this
        }
        if (theBall.x < .001 && theBall.x > -.001){
            if(theBall.y > 0){ // x and y will never both be zero at the same time
                angle = Math.PI/2;
            } else {
                angle = -Math.PI/2;
            }
        }

        var dist = Math.sqrt(theBall.x * theBall.x + theBall.y * theBall.y);
        var force = G / (dist * dist);
        theBall.xv = theBall.xv - force * Math.cos(angle);
        theBall.yv = theBall.yv - force * Math.sin(angle);
        theBall.x = theBall.x + theBall.xv * sf;
        theBall.y = theBall.y + theBall.yv * sf;

        updateData();
    }

    function crash(m_audio){
        crashed = true;
        halt();       
        m_audio.currentTime = 0;
        m_audio.play();
    }

    function halt(){
        clearTimeout(timeout);
    	isRunning = false;
    	draw();
    	stopButton.hide();
		startButton.show();
    }

    function restart(){
    	theBall = new ball();
        count = 0;

        updateData();

        clearTimeout(timeout);
        initialDraw();
    	draw();
    	run();
    }

    function updateData(){
        var vel = Math.sqrt(theBall.xv * theBall.xv + theBall.yv * theBall.yv) * reality_conversion / 10.6;
        var distro = Math.sqrt(theBall.x * theBall.x + theBall.y * theBall.y) * h_conversion;
        document.getElementById("velspan").innerHTML = "Current Velocity: " + Math.round(vel) + " m/s";
        document.getElementById("distspan").innerHTML = "Elevation: " + Math.round(distro) + " km";
    }

    function start(){
        clearTimeout(timeout);
        draw();
        run();
    }

    function ball() {
    	this.x = 14;
    	this.y = 178; // const
    	this.xv = 0;
    	this.yv = 0;
        // compute initial velocities
        var sf = 10.6 * speed; // scaling factor (this is the perfect circular speed from which escape velocity is calculated)
        var ang = Math.atan(this.y / this.x);
        if (this.x < 0){
            ang += Math.PI; // atan only covers half a circle without this
        }
        if (this.x < .001 && this.x > -.001){
            if(this.y > 0){ // x and y will never both be zero at the same time
                ang = Math.PI/2;
            } else {
                ang = -Math.PI/2;
            }
        }
        // obv this is only intended to work with the small offset for the location of the mountain
        this.xv = Math.cos(ang - Math.PI/2) * sf;
        this.yv = Math.sin(ang - Math.PI/2) * sf;
    }

    function mobileCheck () {
        // courtesy of detectmobilebrowsers.com
      var check = false;
      (function(a){if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0,4)))check = true})(navigator.userAgent||navigator.vendor||window.opera);
      return check;
    }

	stopButton.hide();
    startButton.click(function () {
        $(this).hide();
        stopButton.show();

        isRunning = true;

        if(crashed){
            cannon_fire_audio.currentTime = 0;
            cannon_fire_audio.play();

            crashed = false;
            restart();
        } else {
            start(); // as opposed to restart, this just gets the ball moving again.
        }
    });

    stopButton.click(function () {
		halt();
    });

    resetButton.click(function () {
    	// this button may want different behavior
        crashed = true;
        canvas_trace_context.clearRect(0, 0, windowWidth, windowHeight);
        halt();
		restart();
    });

    pathButton.click(function () {
        canvas_trace_context.clearRect(0, 0, windowWidth, windowHeight);
        drawPath = !drawPath;
        draw();
    });

    speedSlider.change(function () {
        crashed = true; // so that we replay the fire sound
        canvas_trace_context.clearRect(0, 0, windowWidth, windowHeight);
        nominal_speed = Number($(this).val());
        speed =  nominal_speed / reality_conversion;
        document.getElementById("splabel").innerHTML = "Initial Velocity: " + Number($(this).val()) + " m/s";
        halt();     
        restart();
    });

})