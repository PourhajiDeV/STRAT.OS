<?php
header("Access-Control-Allow-Origin: https://pourhajidev.ir");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json; charset=UTF-8");
header("X-Content-Type-Options: nosniff");
header("X-Frame-Options: DENY");

$db_host = "localhost";
$db_user = "root";
$db_pass = "strongpassword";
$db_name = "stratos_db";

$conn = new mysqli($db_host, $db_user, $db_pass, $db_name);
if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Database connection error"]);
    exit();
}
$conn->set_charset("utf8mb4");

function hijriToJulian($d, $m, $y) {
    return floor((11 * $y + 3) / 30) + 354 * $y + 30 * $m - floor(($m - 1) / 2) + $d + 1948440 - 385;
}

function julianToJalali($jdn) {
    $dep = $jdn - 2121446;
    $cycle = floor($dep / 1029983);
    $rem = $dep % 1029983;
    $y33 = ($rem == 1029982) ? 2820 : floor(($rem + 366) / 365.24219858156);
    $jy = $y33 + $cycle * 2820 + 474;
    if ($jy <= 0) $jy--;
    
    $sal_a = [0, 31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];
    $d2 = $rem % 365;
    $jm = 1;
    for ($i = 1; $i <= 12; $i++) {
        if ($d2 < $sal_a[$i]) { $jm = $i; break; }
        $d2 -= $sal_a[$i];
    }
    $jd = floor($d2) + 1;
    return [$jy, $jm, $jd];
}

$lunar_holidays = [
    "9/1" => "تاسوعای حسینی",
    "10/1" => "عاشورای حسینی",
    "20/2" => "اربعین حسینی",
    "28/2" => "شهادت پیامبر اسلام (ص) و امام حسن مجتبی (ع)",
    "30/2" => "شهادت امام رضا (ع)",
    "17/3" => "ولادت پیامبر (ص) و امام جعفر صادق (ع)",
    "3/6" => "شهادت حضرت فاطمه الزهرا (س)",
    "13/7" => "ولادت امام علی (ع)",
    "27/7" => "مبعث پیامبر (ص)",
    "15/8" => "ولادت قائم آل محمد (عج) / نیمه شعبان",
    "21/9" => "شهادت امام علی (ع)",
    "1/10" => "عید سعید فطر",
    "2/10" => "تعطیل به مناسبت عید فطر",
    "25/10" => "شهادت امام جعفر صادق (ع)",
    "10/12" => "عید سعید قربان",
    "18/12" => "عید سعید غدیر خم"
];

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input'), true);

if ($method === 'GET' && isset($_GET['action']) && $_GET['action'] === 'get_holidays') {
    $shamsiYear = isset($_GET['year']) ? intval($_GET['year']) : 1403;
    
    $solarHolidays = [
        "1/1" => "جشن نوروز - تعطیل رسمی", "1/2" => "عید نوروز", "1/3" => "عید نوروز", "1/4" => "عید نوروز",
        "1/12" => "روز جمهوری اسلامی", "1/13" => "روز طبیعت (سیزده بدر)",
        "3/14" => "رحلت امام خمینی (ره)", "3/15" => "قیام ۱۵ خرداد",
        "11/22" => "پیروزی انقلاب اسلامی", "12/29" => "روز ملی شدن صنعت نفت"
    ];

    $approxHijriYear = floor(($shamsiYear - 1398) * 1.0307) + 1441;
    foreach ($lunar_holidays as $lDate => $title) {
        list($lDay, $lMonth) = explode('/', $lDate);
        $jdn = hijriToJulian(intval($lDay), intval($lMonth), $approxHijriYear);
        $jalali = julianToJalali($jdn);
        $key = $jalali[1] . '/' . $jalali[2];
        if (!isset($solarHolidays[$key])) {
            $solarHolidays[$key] = $title;
        }
    }

    echo json_encode(["status" => "success", "holidays" => $solarHolidays]);
    exit();
}

if ($method === 'POST' && isset($input['action'])) {
    $action = $input['action'];

    if ($action === 'register') {
        $user = trim($input['username'] ?? '');
        $pass = $input['password'] ?? '';
        
        if (empty($user) || empty($pass) || strlen($user) < 3) {
            echo json_encode(["status" => "error", "message" => "ورودی‌ها معتبر نیستند"]);
            exit();
        }

        $hashed_pass = password_hash($pass, PASSWORD_BCRYPT);
        
        $stmt = $conn->prepare("INSERT INTO stratos_users (username, password) VALUES (?, ?)");
        $stmt->bind_param("ss", $user, $hashed_pass);
        if ($stmt->execute()) {
            echo json_encode(["status" => "success", "user_id" => $stmt->insert_id]);
        } else {
            echo json_encode(["status" => "error", "message" => "نام کاربری قبلاً انتخاب شده است"]);
        }
        $stmt->close();
    }
    
    elseif ($action === 'login') {
        $user = trim($input['username'] ?? '');
        $pass = $input['password'] ?? '';
        
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
        $user_id = intval($input['user_id'] ?? 0);
        $payload = json_encode($input['payload'] ?? [], JSON_UNESCAPED_UNICODE);
        
        if ($user_id <= 0) {
            echo json_encode(["status" => "error", "message" => "شناسه کاربر نامعتبر است"]);
            exit();
        }

        $stmt = $conn->prepare("INSERT INTO stratos_state (user_id, data_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE data_value = VALUES(data_value)");
        $stmt->bind_param("is", $user_id, $payload);
        if ($stmt->execute()) {
            echo json_encode(["status" => "success"]);
        } else {
            echo json_encode(["status" => "error"]);
        }
        $stmt->close();
    }
} 

elseif ($method === 'GET' && isset($_GET['action']) && $_GET['action'] === 'load_db') {
    $user_id = intval($_GET['user_id'] ?? 0);
    if ($user_id <= 0) {
        echo json_encode(["status" => "empty"]);
        exit();
    }

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