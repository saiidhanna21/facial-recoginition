const video = document.getElementById('video');
var data;
let attendanceUpdated = false;
let labelCounter = {};
async function getData() {
	const response = await fetch('https://facial-recognitions.onrender.com/data');
	data = await response.json();
}
getData();
Promise.all([
	faceapi.nets.ssdMobilenetv1.loadFromUri('/static/models'),
	faceapi.nets.faceRecognitionNet.loadFromUri('/static/models'),
	faceapi.nets.faceLandmark68Net.loadFromUri('/static/models'),
]).then(startWebcam);

function startWebcam() {
	navigator.mediaDevices
		.getUserMedia({
			video: true,
			audio: false,
		})
		.then((stream) => {
			video.srcObject = stream;
		})
		.catch((error) => {
			console.error(error);
		});
}

async function getLabeledFaceDescriptions() {
	try {
		const data_values = await Promise.all(
			data.map(async (item, index) => {
				const label = item.name;
				var filePath;
				const descriptions = [];
				for (let i = 1; i <= 1; i++) {
					const imageData = item.image;
					await fetch('/api/save_image', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({
							base64_image: imageData,
							index,
						}),
					})
						.then((response) => response.json())
						.then((data) => {
							// Retrieve the file path from the API response
							filePath = data.file_path;
						})
						.catch((error) => console.error(error));

					filePath = `/${filePath}`;
					const img = await faceapi.fetchImage(filePath);
					const detections = await faceapi
						.detectSingleFace(img)
						.withFaceLandmarks()
						.withFaceDescriptor();
					if (detections) {
						descriptions.push(detections.descriptor);
					} else {
						console.log('No face detected in the image:', filePath);
					}
				}
				return new faceapi.LabeledFaceDescriptors(label, descriptions);
			})
		);

		return data_values;
	} catch (error) {
		console.error('Error:', error);
	}
}

video.addEventListener(
	'play',
	async () => {
		const labeledFaceDescriptors = await getLabeledFaceDescriptions();
		const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors);

		const canvas = faceapi.createCanvasFromMedia(video);
		document.body.append(canvas);

		const displaySize = { width: video.width, height: video.height };
		faceapi.matchDimensions(canvas, displaySize);

		// Set willReadFrequently attribute to true for the canvas
		canvas.getContext('2d').willReadFrequently = true;

		setInterval(async () => {
			const detectionWithLandmarks = await faceapi
				.detectSingleFace(video)
				.withFaceLandmarks();

			if (detectionWithLandmarks) {
				const resizedDetection = faceapi.resizeResults(detectionWithLandmarks, displaySize);

				canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

				const result = faceMatcher.findBestMatch(resizedDetection.descriptor);

				const box = resizedDetection.detection.box;
				const drawBox = new faceapi.draw.DrawBox(box, {
					label: result.toString(),
				});
				drawBox.draw(canvas);
				if (result.label !== 'unknown' && !attendanceUpdated) {
					const personName = result.label;
					labelCounter[personName] = (labelCounter[personName] || 0) + 1;

					if (labelCounter[personName] >= 10) {
						console.log(
							`Detected ${personName} more than 10 times. Stopping detection.`
						);
						if (!attendanceUpdated) {
							updateAttendance(personName);
						}
						return;
					}
				} else if (result.label === 'unknown') {
					const unknownCounter = (labelCounter['unknown'] || 0) + 1;

					if (unknownCounter >= 10) {
						console.log('Cannot detect face. Please try again.');
						return;
					}
					labelCounter['unknown'] = unknownCounter;
				}
			}
		});
	},
	1000
);
async function updateAttendance(personName) {
	if (!attendanceUpdated) {
		attendanceUpdated = true;
		await fetch('/api/get_student_id', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				personName: personName,
			}),
		})
			.then((response) => response.json())
			.then((data) => {
				const student_id = data.student_id;

				const otpHeader = document.createElement('h3');
				otpHeader.innerText = 'Enter Otp: ';
				// Display the OTP input field and submit button
				const otpInput = document.createElement('input');
				otpInput.setAttribute('type', 'text');
				otpInput.setAttribute('id', 'otp_input');
				otpInput.setAttribute('placeholder', 'Enter OTP');

				const submitButton = document.createElement('button');
				submitButton.setAttribute('type', 'submit');
				submitButton.innerText = 'Submit';

				document.body.appendChild(otpHeader);
				document.body.appendChild(otpInput);
				document.body.appendChild(submitButton);
				const videoElement = document.getElementById('video');

				videoElement.parentNode.insertBefore(
					otpHeader,
					videoElement.nextSibling
				);
				videoElement.parentNode.insertBefore(otpInput, otpHeader.nextSibling);
				videoElement.parentNode.insertBefore(
					submitButton,
					otpInput.nextSibling
				);

				// Add an event listener to the submit button
				submitButton.addEventListener('click', async () => {
					const otp_input = otpInput.value;

					await fetch('/api/update_attendance', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({
							student_id: student_id,
							otp_input: otp_input,
						}),
					})
						.then((response) => response.json())
						.then((data) => {
							if (data.message === 'Attendance updated successfully') {
								// Handle successful attendance update
								document.getElementById('message').innerText =
									'Attendance Updated';
							} else {
								// Handle OTP verification failure
								document.getElementById('message').innerText =
									'OTP verification failed';
							}
						});
				});
			});
	}
}
