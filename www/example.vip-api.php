<?php
header("Access-Control-Allow-Origin: https://pourhajidev.ir");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json; charset=UTF-8");

$db_host = "localhost";
$db_user = "root";
$db_pass = "strongpassword";
$db_name = "stratos_db";

$conn = new mysqli($db_host, $db_user, $db_pass, $db_name);
if ($conn->connect_error) {
    echo json_encode(["status" => "error", "message" => "Connection failed"]);
    exit();
}
$conn->set_charset("utf8mb4");

$conn->query("CREATE TABLE IF NOT EXISTS stratos_vip_permissions (
    user_id INT PRIMARY KEY,
    granted_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)");

$conn->query("CREATE TABLE IF NOT EXISTS stratos_friends (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    friend_id INT,
    status ENUM('pending', 'accepted') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY friend_pair (user_id, friend_id)
)");

$conn->query("CREATE TABLE IF NOT EXISTS stratos_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sender_id INT,
    receiver_id INT,
    message_type ENUM('text', 'image', 'video', 'file', 'data_share') DEFAULT 'text',
    content LONGTEXT,
    file_path VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)");

$conn->query("INSERT IGNORE INTO stratos_vip_permissions (user_id, granted_by) VALUES (1, 1)");

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input'), true);

function isVip($conn, $userId) {
    $stmt = $conn->prepare("SELECT user_id FROM stratos_vip_permissions WHERE user_id = ?");
    $stmt->bind_param("i", $userId);
    $stmt->execute();
    $res = $stmt->get_result();
    $isVip = $res->num_rows > 0;
    $stmt->close();
    return $isVip;
}

if ($method === 'POST') {
    $action = $input['action'] ?? '';
    $userId = intval($input['user_id'] ?? 0);

    if (!isVip($conn, $userId)) {
        echo json_encode(["status" => "error", "message" => "دسترسی VIP یافت نشد."]);
        exit();
    }

    if ($action === 'grant_vip') {
        $targetId = intval($input['target_id'] ?? 0);
        $stmt = $conn->prepare("INSERT IGNORE INTO stratos_vip_permissions (user_id, granted_by) VALUES (?, ?)");
        $stmt->bind_param("ii", $targetId, $userId);
        if ($stmt->execute()) {
            echo json_encode(["status" => "success", "message" => "دسترسی VIP به کاربر اعطا شد."]);
        } else {
            echo json_encode(["status" => "error", "message" => "خطا در اعطای دسترسی."]);
        }
        $stmt->close();
    }

    elseif ($action === 'send_friend_request') {
        $friendId = intval($input['friend_id'] ?? 0);
        if ($friendId === $userId || $friendId <= 0) {
            echo json_encode(["status" => "error", "message" => "آیدی معتبر نیست."]);
            exit();
        }
        $stmt = $conn->prepare("INSERT INTO stratos_friends (user_id, friend_id, status) VALUES (?, ?, 'pending') ON DUPLICATE KEY UPDATE status=status");
        $stmt->bind_param("ii", $userId, $friendId);
        if ($stmt->execute()) {
            echo json_encode(["status" => "success", "message" => "درخواست دوستی ارسال شد."]);
        }
        $stmt->close();
    }

    elseif ($action === 'accept_friend') {
        $reqId = intval($input['request_id'] ?? 0);
        $stmt = $conn->prepare("UPDATE stratos_friends SET status = 'accepted' WHERE id = ? AND friend_id = ?");
        $stmt->bind_param("ii", $reqId, $userId);
        $stmt->execute();
        echo json_encode(["status" => "success"]);
        $stmt->close();
    }

    elseif ($action === 'send_message') {
        $receiverId = intval($input['receiver_id'] ?? 0);
        $type = $input['msg_type'] ?? 'text';
        $content = $input['content'] ?? '';

        $stmt = $conn->prepare("INSERT INTO stratos_messages (sender_id, receiver_id, message_type, content) VALUES (?, ?, ?, ?)");
        $stmt->bind_param("iiss", $userId, $receiverId, $type, $content);
        if ($stmt->execute()) {
            echo json_encode(["status" => "success", "msg_id" => $stmt->insert_id]);
        }
        $stmt->close();
    }

    elseif ($action === 'upload_file') {
        // آپلود عکس، ویدیو و فایل
        if (isset($_FILES['file'])) {
            $u_id = intval($_POST['user_id']);
            $r_id = intval($_POST['receiver_id']);
            $type = $_POST['msg_type'];
            
            $targetDir = "uploads/vip/";
            if (!file_exists($targetDir)) mkdir($targetDir, 0777, true);

            $fileName = time() . '_' . basename($_FILES["file"]["name"]);
            $targetFilePath = $targetDir . $fileName;

            if (move_uploaded_file($_FILES["file"]["tmp_name"], $targetFilePath)) {
                $stmt = $conn->prepare("INSERT INTO stratos_messages (sender_id, receiver_id, message_type, content, file_path) VALUES (?, ?, ?, ?, ?)");
                $stmt->bind_param("iisss", $u_id, $r_id, $type, $fileName, $targetFilePath);
                $stmt->execute();
                echo json_encode(["status" => "success", "file_url" => $targetFilePath]);
                $stmt->close();
            } else {
                echo json_encode(["status" => "error", "message" => "خطا در آپلود فایل"]);
            }
        }
    }
}

elseif ($method === 'GET') {
    $action = $_GET['action'] ?? '';
    $userId = intval($_GET['user_id'] ?? 0);

    if (!isVip($conn, $userId)) {
        echo json_encode(["status" => "error", "message" => "VIP Access Required"]);
        exit();
    }

    if ($action === 'get_friends') {
        $stmt = $conn->prepare("
            SELECT f.id as req_id, f.status, u.id as user_id, u.username 
            FROM stratos_friends f 
            JOIN stratos_users u ON (u.id = IF(f.user_id = ?, f.friend_id, f.user_id))
            WHERE (f.user_id = ? OR f.friend_id = ?)
        ");
        $stmt->bind_param("iii", $userId, $userId, $userId);
        $stmt->execute();
        $res = $stmt->get_result();
        $friends = [];
        while ($row = $res->fetch_assoc()) {
            $friends[] = $row;
        }
        echo json_encode(["status" => "success", "data" => $friends]);
        $stmt->close();
    }

    elseif ($action === 'get_messages') {
        $friendId = intval($_GET['friend_id'] ?? 0);
        $lastId = intval($_GET['last_id'] ?? 0);

        $stmt = $conn->prepare("
            SELECT * FROM stratos_messages 
            WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
            AND id > ? ORDER BY id ASC
        ");
        $stmt->bind_param("iiiii", $userId, $friendId, $friendId, $userId, $lastId);
        $stmt->execute();
        $res = $stmt->get_result();
        $msgs = [];
        while ($row = $res->fetch_assoc()) {
            $msgs[] = $row;
        }
        echo json_encode(["status" => "success", "messages" => $msgs]);
        $stmt->close();
    }
}

$conn->close();
?>