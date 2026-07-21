<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json; charset=UTF-8");

$db_host = "localhost";
$db_user = "root";
$db_pass = "STRONGPASSWORD";
$db_name =  "root";

$conn = new mysqli($db_host, $db_user, $db_pass, $db_name);
if ($conn->connect_error) {
    echo json_encode(["status" => "error", "message" => "Connection failed"]);
    exit();
}
$conn->set_charset("utf8mb4");

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input'), true);

if ($method === 'POST' && isset($input['action'])) {
    $action = $input['action'];

    if ($action === 'register') {
        $user = trim($input['username']);
        $pass = password_hash($input['password'], PASSWORD_BCRYPT);
        
        $stmt = $conn->prepare("INSERT INTO stratos_users (username, password) VALUES (?, ?)");
        $stmt->bind_param("ss", $user, $pass);
        if ($stmt->execute()) {
            echo json_encode(["status" => "success", "user_id" => $stmt->insert_id]);
        } else {
            echo json_encode(["status" => "error", "message" => "نام کاربری قبلاً انتخاب شده است"]);
        }
        $stmt->close();
    }
    
    elseif ($action === 'login') {
        $user = trim($input['username']);
        $pass = $input['password'];
        
        $stmt = $conn->prepare("SELECT id, password FROM stratos_users WHERE username = ?");
        $stmt->bind_param("s", $user);
        $stmt->execute();
        $result = $stmt->get_result();
        
        if ($result->num_rows > 0) {
            $row = $result->fetch_assoc();
            if (password_verify($pass, $row['password'])) {
                echo json_encode(["status" => "success", "user_id" => $row['id']]);
            } else {
                echo json_encode(["status" => "error", "message" => "رمز عبور اشتباه است"]);
            }
        } else {
            echo json_encode(["status" => "error", "message" => "کاربر یافت نشد"]);
        }
        $stmt->close();
    }
    
    elseif ($action === 'sync_db') {
        $user_id = intval($input['user_id']);
        $payload = json_encode($input['payload'], JSON_UNESCAPED_UNICODE);
        
        $stmt = $conn->prepare("INSERT INTO stratos_state (user_id, data_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE data_value = ?");
        $stmt->bind_param("iss", $user_id, $payload, $payload);
        if ($stmt->execute()) {
            echo json_encode(["status" => "success"]);
        } else {
            echo json_encode(["status" => "error"]);
        }
        $stmt->close();
    }
} 

elseif ($method === 'GET' && isset($_GET['action']) && $_GET['action'] === 'load_db') {
    $user_id = intval($_GET['user_id']);
    $stmt = $conn->prepare("SELECT data_value FROM stratos_state WHERE user_id = ?");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if ($result->num_rows > 0) {
        $row = $result->fetch_assoc();
        echo $row['data_value'];
    } else {
        echo json_encode(["status" => "empty"]);
    }
    $stmt->close();
}

$conn->close();
?>