import base64
import datetime
from io import BytesIO
import json
import os
from PIL import Image
from flask import Flask, jsonify, render_template, request, send_from_directory, session
import mysql.connector
from flask_cors import CORS
from cryptography.fernet import Fernet
import os
import mysql.connector

host = os.environ.get('DB_HOST')
user = os.environ.get('DB_USER')
password = os.environ.get('DB_PASSWORD')
database = os.environ.get('DB_DATABASE')

app = Flask(__name__)
CORS(app) 
app.secret_key = 'secret'

@app.route('/')
def index():
    try:
        session_time_str = request.args.get('session_time', default=None)

        if session_time_str:
            session_time = datetime.datetime.strptime(
                session_time_str, "%Y-%m-%d %H:%M:%S")
            #Set the session variable with the provided session time
            session['session_time'] = session_time
        else:
            raise ValueError("Unauthorized Access")
    except:
        return jsonify({'message':'Unauthorized Access'})
    return render_template('index.html')


@app.route('/data')
def get_data():
    # Connect to MySQL
    conn = mysql.connector.connect(
        host=host,
        user=user,
        password=password,
        database=database
    )

    # Execute a query
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM students')
    data = cursor.fetchall()

    # Close the connection
    cursor.close()
    conn.close()
    result = []
    for item in data:
        # Convert bytes to base64 string
        blob_base64 = base64.b64encode(item[3]).decode('utf-8')
        key = b'FwMO2y7T1iWUEhmaw3iVHn56jE09wjTMhrvBbUIoTLQ='
        cipher_suite = Fernet(key)
        # Create a dictionary with the converted blob
        item_dict = {
            'id': item[0],
            'name': cipher_suite.decrypt(item[1]).decode(),
            'tpNumber': cipher_suite.decrypt(item[2]).decode(),
            'image': blob_base64
        }
        
        result.append(item_dict)

        # Serialize the result list to JSON
    json_data = json.dumps(result)

    return json_data
    
@app.route('/api/save_image', methods=['POST'])
def save_image():
    # Retrieve the base64 image data from the request payload
    base64_image = request.json.get('base64_image')
    index = request.json.get('index')
    if base64_image:
        # Decode the base64 image data
        image_data = base64.b64decode(base64_image)

        # Create a PIL Image object
        image = Image.open(BytesIO(image_data))

        # Define the file path and name
        file_path = f"static/labels/{index}.png"

        # Create the required directories if they don't exist
        os.makedirs(os.path.dirname(file_path), exist_ok=True)

        if os.path.exists(file_path):
            os.remove(file_path)

        # Save the image as a PNG file, overwriting if it exists
        image.save(file_path, "PNG", overwrite=True)

        # Return the file path as the API response
        return jsonify({"file_path": file_path})

    # Return an error response if base64_image parameter is missing
    return jsonify({"error": "Missing base64_image parameter"}), 400


@app.route('/api/get_student_id', methods=['POST'])
def get_student_id():
    key = b'FwMO2y7T1iWUEhmaw3iVHn56jE09wjTMhrvBbUIoTLQ='
    cipher_suite = Fernet(key)
    person_name = request.json.get('personName')
    
    conn = mysql.connector.connect(
        host=host,
        user=user,
        password=password,
        database=database
    )
    
    cursor = conn.cursor()
    cursor.execute("SELECT id, name FROM students")

    rows = cursor.fetchall()

    for row in rows:
        # Assuming you have a decrypt_name function
        decrypted_name = cipher_suite.decrypt(row[1]).decode()
        if decrypted_name == person_name:
            person_id = row[0]
            break

    cursor.close()
    conn.close()
    return jsonify({'student_id': person_id})

@app.route('/api/update_attendance',methods=['POST'])
def update_attendance():
    student_id = request.json.get('student_id')
    otp_input = request.json.get('otp_input')
    conn = mysql.connector.connect(
        host=host,
        user=user,
        password=password,
        database=database
    )

    cursor = conn.cursor()
    
    cursor.execute("SELECT otp FROM courses LIMIT 1")
    otp_in_db = cursor.fetchone()[0]
    if otp_input == otp_in_db:    
        cursor.execute(
            "UPDATE attendance SET status = 'Attended' WHERE student_id = %s AND session_time = %s",
            (student_id, session['session_time']))

        conn.commit()
        cursor.close()
        conn.close()

        return jsonify({'message': 'Attendance updated successfully'})
    else:
        return jsonify({'message': 'OTP verification failed'})
@app.route('/static/<path:filename>')
def serve_static(filename):
    root_dir = os.path.dirname(os.getcwd())
    return send_from_directory(os.path.join(root_dir, 'static'), filename)

if __name__ == '__main__':
    CORS(app)
    app.run(debug=True,host='0.0.0.0')

