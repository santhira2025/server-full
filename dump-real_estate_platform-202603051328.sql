-- MySQL dump 10.13  Distrib 8.0.45, for Win64 (x86_64)
--
-- Host: 168.144.0.105    Database: real_estate_platform
-- ------------------------------------------------------
-- Server version	8.0.45

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `amenities`
--

DROP TABLE IF EXISTS `amenities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `amenities` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `icon` varchar(50) DEFAULT NULL,
  `category` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `amenities`
--

LOCK TABLES `amenities` WRITE;
/*!40000 ALTER TABLE `amenities` DISABLE KEYS */;
INSERT INTO `amenities` VALUES (1,'Swimming Pool','waves','Recreation'),(2,'Gym','dumbbell','Recreation'),(3,'Parking','car','Basic'),(4,'Security','shield','Basic'),(5,'Power Backup','zap','Basic'),(6,'Lift','arrow-up','Basic'),(7,'Garden','flower','Recreation'),(8,'Clubhouse','users','Recreation'),(9,'Children Play Area','baby','Recreation'),(10,'CCTV','camera','Security'),(11,'Intercom','phone','Security'),(12,'Fire Safety','flame','Security'),(13,'Water Supply','droplet','Basic'),(14,'Gas Pipeline','flame','Basic'),(15,'WiFi','wifi','Basic'),(16,'Air Conditioning','wind','Comfort'),(17,'Modular Kitchen','utensils','Interior'),(18,'Wardrobe','archive','Interior'),(19,'Balcony','sun','Basic'),(20,'Terrace','sun','Basic');
/*!40000 ALTER TABLE `amenities` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `favorites`
--

DROP TABLE IF EXISTS `favorites`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `favorites` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `property_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_favorite` (`user_id`,`property_id`),
  KEY `property_id` (`property_id`),
  CONSTRAINT `favorites_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `favorites_ibfk_2` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `favorites`
--

LOCK TABLES `favorites` WRITE;
/*!40000 ALTER TABLE `favorites` DISABLE KEYS */;
/*!40000 ALTER TABLE `favorites` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inquiries`
--

DROP TABLE IF EXISTS `inquiries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inquiries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `property_id` int NOT NULL,
  `user_name` varchar(100) NOT NULL,
  `user_email` varchar(255) DEFAULT NULL,
  `user_phone` varchar(20) NOT NULL,
  `message` text,
  `inquiry_type` enum('call','message','callback_request') NOT NULL,
  `status` enum('new','contacted','closed') DEFAULT 'new',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_property_inquiries` (`property_id`),
  KEY `idx_inquiry_status` (`status`),
  CONSTRAINT `inquiries_ibfk_1` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inquiries`
--

LOCK TABLES `inquiries` WRITE;
/*!40000 ALTER TABLE `inquiries` DISABLE KEYS */;
/*!40000 ALTER TABLE `inquiries` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `otp_verifications`
--

DROP TABLE IF EXISTS `otp_verifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `otp_verifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `phone` varchar(20) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `otp_code` varchar(6) NOT NULL,
  `purpose` enum('registration','login','password_reset') NOT NULL,
  `expires_at` timestamp NOT NULL,
  `is_used` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_phone_otp` (`phone`,`otp_code`),
  KEY `idx_email_otp` (`email`,`otp_code`)
) ENGINE=InnoDB AUTO_INCREMENT=96 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `otp_verifications`
--

LOCK TABLES `otp_verifications` WRITE;
/*!40000 ALTER TABLE `otp_verifications` DISABLE KEYS */;
INSERT INTO `otp_verifications` VALUES (19,'6374777455',NULL,'990948','login','2026-02-25 11:38:14',1,'2026-02-25 05:58:13'),(20,'6374777455',NULL,'808863','login','2026-02-25 11:39:59',1,'2026-02-25 05:59:59'),(21,'6374777455',NULL,'374496','login','2026-02-25 11:46:25',1,'2026-02-25 06:06:24'),(22,'6374777455',NULL,'202568','login','2026-02-25 12:19:54',1,'2026-02-25 06:39:53'),(23,'98765432',NULL,'741889','login','2026-02-25 12:49:16',0,'2026-02-25 07:09:16'),(24,'9080285866',NULL,'802073','login','2026-02-25 13:13:21',1,'2026-02-25 07:32:08'),(25,'9999999999',NULL,'861294','login','2026-02-25 13:18:00',0,'2026-02-25 07:36:47'),(26,'6374777455',NULL,'919944','login','2026-02-25 14:58:34',1,'2026-02-25 09:18:34'),(27,'6374777455',NULL,'862002','login','2026-02-25 15:07:06',1,'2026-02-25 09:27:05'),(28,'6374777455',NULL,'419263','login','2026-02-25 15:11:44',1,'2026-02-25 09:31:43'),(29,'9080285866',NULL,'649481','login','2026-02-25 15:25:30',1,'2026-02-25 09:44:16'),(30,'6374777455',NULL,'470796','login','2026-02-25 15:40:39',1,'2026-02-25 10:05:38'),(31,'6374777455',NULL,'144856','login','2026-02-25 16:10:49',1,'2026-02-25 10:35:48'),(32,'9080285866',NULL,'426744','login','2026-02-25 16:13:03',1,'2026-02-25 10:38:02'),(33,'9080285866',NULL,'682531','login','2026-02-25 16:18:57',1,'2026-02-25 10:43:56'),(34,'9080285866',NULL,'403831','login','2026-02-25 16:28:36',1,'2026-02-25 10:53:35'),(35,'9080285866',NULL,'754409','login','2026-02-25 16:29:37',1,'2026-02-25 10:54:36'),(36,'9080285866',NULL,'652392','login','2026-02-25 16:49:21',1,'2026-02-25 11:14:20'),(37,'9080285866',NULL,'729592','login','2026-02-25 17:36:06',1,'2026-02-25 12:01:06'),(38,'6374777455',NULL,'278575','login','2026-02-25 17:37:10',1,'2026-02-25 12:02:09'),(39,'6374777455',NULL,'176837','login','2026-02-25 17:39:14',1,'2026-02-25 12:04:13'),(40,'9080285866',NULL,'206173','login','2026-02-25 17:42:13',1,'2026-02-25 12:07:13'),(41,'9080285866',NULL,'347751','login','2026-02-25 17:42:29',1,'2026-02-25 12:07:28'),(42,'6374777455',NULL,'990338','login','2026-02-25 18:00:08',1,'2026-02-25 12:25:08'),(43,'9080285866',NULL,'507878','login','2026-02-25 18:05:30',1,'2026-02-25 12:30:29'),(44,'9080582866',NULL,'723492','login','2026-02-25 18:09:09',0,'2026-02-25 12:34:09'),(45,'9080285866',NULL,'723515','login','2026-02-25 18:10:13',1,'2026-02-25 12:35:13'),(46,'9360564421',NULL,'925187','login','2026-02-26 11:09:03',1,'2026-02-26 05:34:03'),(47,'6374777455',NULL,'453071','login','2026-02-26 11:11:29',1,'2026-02-26 05:36:29'),(48,'6374777455',NULL,'693538','login','2026-02-26 11:16:46',1,'2026-02-26 05:41:45'),(49,'6374777455',NULL,'101492','login','2026-02-26 12:26:47',1,'2026-02-26 06:51:47'),(50,'6374777455',NULL,'722520','login','2026-02-26 13:09:14',1,'2026-02-26 07:34:14'),(51,'6374777455',NULL,'588418','login','2026-02-26 13:19:51',1,'2026-02-26 07:44:51'),(52,'6374777455',NULL,'715515','login','2026-02-26 13:32:29',1,'2026-02-26 07:56:14'),(53,'6374777455',NULL,'794693','login','2026-02-26 13:32:46',1,'2026-02-26 07:57:46'),(54,'9080285866',NULL,'207319','login','2026-02-26 15:31:46',1,'2026-02-26 09:55:32'),(55,'6374777455',NULL,'822860','login','2026-02-26 15:46:04',1,'2026-02-26 10:11:05'),(56,'6374777455',NULL,'215182','login','2026-02-26 16:29:23',1,'2026-02-26 10:54:23'),(57,'9080285866',NULL,'909449','login','2026-02-26 18:04:21',1,'2026-02-26 12:29:20'),(58,'9080285866',NULL,'336370','login','2026-02-27 10:04:41',1,'2026-02-27 04:28:25'),(59,'9080285866',NULL,'829659','login','2026-02-27 10:47:01',1,'2026-02-27 05:12:00'),(60,'6374777455',NULL,'831126','login','2026-02-27 10:53:37',1,'2026-02-27 05:17:21'),(61,'9080285866',NULL,'494765','login','2026-02-27 10:54:31',1,'2026-02-27 05:18:15'),(62,'6374777455',NULL,'385046','login','2026-02-27 10:59:28',1,'2026-02-27 05:23:12'),(63,'9080285866',NULL,'889808','login','2026-02-27 11:03:41',1,'2026-02-27 05:27:25'),(64,'9080285866',NULL,'233473','login','2026-02-27 11:06:05',1,'2026-02-27 05:29:49'),(65,'9080285866',NULL,'624608','login','2026-02-27 11:20:55',1,'2026-02-27 05:44:39'),(66,'6374777455',NULL,'988646','login','2026-02-27 11:21:33',1,'2026-02-27 05:46:34'),(67,'6374777455',NULL,'487445','login','2026-02-27 11:22:43',1,'2026-02-27 05:47:45'),(68,'7449242770',NULL,'993074','login','2026-02-27 11:25:23',1,'2026-02-27 05:50:25'),(69,'7449242770',NULL,'586530','login','2026-02-27 11:27:19',1,'2026-02-27 05:52:20'),(70,'6374777455',NULL,'779413','login','2026-02-27 11:32:16',1,'2026-02-27 05:57:17'),(71,'9080285866',NULL,'964550','login','2026-03-01 11:32:54',1,'2026-03-01 05:56:35'),(72,'9080285866',NULL,'448778','login','2026-03-01 11:36:17',1,'2026-03-01 05:59:58'),(73,'9080285866',NULL,'539268','login','2026-03-01 11:47:50',1,'2026-03-01 06:11:31'),(74,'9080285866',NULL,'501414','login','2026-03-01 11:59:29',1,'2026-03-01 06:23:09'),(75,'9080285866',NULL,'647499','login','2026-03-02 11:56:42',1,'2026-03-02 06:21:41'),(76,'9080285866',NULL,'785692','login','2026-03-02 12:19:38',1,'2026-03-02 06:44:36'),(77,'9080285886',NULL,'174437','login','2026-03-02 12:36:42',0,'2026-03-02 07:01:40'),(78,'9080285866',NULL,'698191','login','2026-03-02 12:38:07',1,'2026-03-02 07:03:06'),(79,'9080285866',NULL,'449953','login','2026-03-02 15:20:29',1,'2026-03-02 09:45:28'),(80,'9080285866',NULL,'331639','login','2026-03-02 16:23:53',1,'2026-03-02 10:48:52'),(81,'9080285866',NULL,'947206','login','2026-03-02 17:37:54',1,'2026-03-02 12:02:54'),(82,'9080285866',NULL,'213771','login','2026-03-03 10:40:54',1,'2026-03-03 05:04:31'),(83,'9080285866',NULL,'241746','login','2026-03-03 12:03:52',1,'2026-03-03 06:28:55'),(84,'6374777455',NULL,'722691','login','2026-03-03 12:06:31',1,'2026-03-03 06:31:33'),(85,'6374777455',NULL,'993690','login','2026-03-03 16:05:07',1,'2026-03-03 10:30:10'),(86,'6374777455',NULL,'902928','login','2026-03-03 16:19:37',1,'2026-03-03 10:43:15'),(87,'6374777455',NULL,'577166','login','2026-03-03 17:06:34',1,'2026-03-03 11:31:37'),(88,'6374777455',NULL,'717311','login','2026-03-03 17:29:32',1,'2026-03-03 11:54:35'),(89,'6374777455',NULL,'281545','login','2026-03-03 17:39:13',1,'2026-03-03 12:04:16'),(90,'6374777455',NULL,'693168','login','2026-03-04 10:17:10',1,'2026-03-04 04:42:09'),(91,'6374777455',NULL,'853508','login','2026-03-04 15:11:23',1,'2026-03-04 09:36:23'),(92,'6374777455',NULL,'977357','login','2026-03-04 15:43:37',1,'2026-03-04 10:08:37'),(93,'6374777455',NULL,'320896','login','2026-03-04 16:20:56',1,'2026-03-04 10:45:56'),(94,'9080285866',NULL,'409380','login','2026-03-04 17:48:36',1,'2026-03-04 12:13:36'),(95,'9080285866',NULL,'795824','login','2026-03-05 11:06:28',1,'2026-03-05 05:31:29');
/*!40000 ALTER TABLE `otp_verifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `properties`
--

DROP TABLE IF EXISTS `properties`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `properties` (
  `id` int NOT NULL AUTO_INCREMENT,
  `builder_id` int NOT NULL,
  `title` varchar(200) NOT NULL,
  `description` text,
  `property_type_id` int DEFAULT NULL,
  `price` decimal(15,2) NOT NULL,
  `price_unit` enum('total','per_sqft','per_month') DEFAULT 'total',
  `area_sqft` decimal(10,2) DEFAULT NULL,
  `bedrooms` int DEFAULT NULL,
  `bathrooms` int DEFAULT NULL,
  `parking_spaces` int DEFAULT '0',
  `furnishing` enum('unfurnished','semi-furnished','fully-furnished') DEFAULT NULL,
  `facing` varchar(20) DEFAULT NULL,
  `floor_number` int DEFAULT NULL,
  `total_floors` int DEFAULT NULL,
  `age_of_property` varchar(50) DEFAULT NULL,
  `address_line1` varchar(255) NOT NULL,
  `address_line2` varchar(255) DEFAULT NULL,
  `city` varchar(100) NOT NULL,
  `state` varchar(100) NOT NULL,
  `pincode` varchar(10) NOT NULL,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `status` enum('available','sold','rented','under_construction') DEFAULT 'available',
  `is_visible` tinyint(1) DEFAULT '1',
  `is_featured` tinyint(1) DEFAULT '0',
  `listing_type` enum('sale','rent') DEFAULT 'sale',
  `subscription_plan` enum('premium','elite','super_elite') DEFAULT 'premium',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `service_choice` enum('gas','painting','cleaning') DEFAULT NULL,
  `map_address` varchar(500) DEFAULT NULL,
  `google_place_id` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `property_type_id` (`property_type_id`),
  KEY `idx_builder` (`builder_id`),
  KEY `idx_city` (`city`),
  KEY `idx_status` (`status`),
  KEY `idx_price` (`price`),
  KEY `idx_listing_type` (`listing_type`),
  FULLTEXT KEY `idx_search` (`title`,`description`,`address_line1`,`city`),
  CONSTRAINT `properties_ibfk_1` FOREIGN KEY (`builder_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `properties_ibfk_2` FOREIGN KEY (`property_type_id`) REFERENCES `property_types` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=31 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `properties`
--

LOCK TABLES `properties` WRITE;
/*!40000 ALTER TABLE `properties` DISABLE KEYS */;
INSERT INTO `properties` VALUES (29,2,'1 BHK House','xmuwehvadkhvuqhvoadvhadlhiovhav',3,60000.00,'total',2000.00,2,2,1,'unfurnished','North-East',2,3,NULL,'1/64e, Netalakurichi, Kelaneduvai po','Near College','Ariyalur','Tamil Nadu','620002',NULL,NULL,'available',1,1,'sale','elite','2026-03-04 09:39:52','2026-03-04 09:39:52',NULL,NULL,NULL),(30,22,'2 BHK House','klnefoihgiwhnlsjbowrhghgownvldskvnrwjrwin',3,599998.00,'total',3000.00,2,2,1,'unfurnished','East',3,1,NULL,'BugetProperty','porur','chennai','Tamil Nadu','600026',NULL,NULL,'available',1,0,'sale','premium','2026-03-05 05:33:53','2026-03-05 05:33:53',NULL,NULL,NULL);
/*!40000 ALTER TABLE `properties` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `property_amenities`
--

DROP TABLE IF EXISTS `property_amenities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `property_amenities` (
  `property_id` int NOT NULL,
  `amenity_id` int NOT NULL,
  PRIMARY KEY (`property_id`,`amenity_id`),
  KEY `amenity_id` (`amenity_id`),
  CONSTRAINT `property_amenities_ibfk_1` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE,
  CONSTRAINT `property_amenities_ibfk_2` FOREIGN KEY (`amenity_id`) REFERENCES `amenities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `property_amenities`
--

LOCK TABLES `property_amenities` WRITE;
/*!40000 ALTER TABLE `property_amenities` DISABLE KEYS */;
INSERT INTO `property_amenities` VALUES (29,1),(30,1),(29,2),(30,5),(30,6),(29,7),(30,7),(29,8),(29,9),(30,9),(30,15),(29,16),(30,17),(29,18),(30,19),(29,20),(30,20);
/*!40000 ALTER TABLE `property_amenities` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `property_images`
--

DROP TABLE IF EXISTS `property_images`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `property_images` (
  `id` int NOT NULL AUTO_INCREMENT,
  `property_id` int NOT NULL,
  `image_url` varchar(500) NOT NULL,
  `is_primary` tinyint(1) DEFAULT '0',
  `display_order` int DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_property_images` (`property_id`),
  CONSTRAINT `property_images_ibfk_1` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=68 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `property_images`
--

LOCK TABLES `property_images` WRITE;
/*!40000 ALTER TABLE `property_images` DISABLE KEYS */;
INSERT INTO `property_images` VALUES (62,29,'https://minio.s3.santhira.com/images/images/104b88bf-fcf8-4d05-84c0-b038c070bac5-wall.jpg',1,0,'2026-03-04 09:39:52'),(63,29,'https://minio.s3.santhira.com/images/images/01757361-986e-45f8-89b7-ff6de6ffd7ba-whatsapp.png',0,1,'2026-03-04 09:39:52'),(64,29,'https://minio.s3.santhira.com/images/images/08ea9042-22e9-4f3d-922e-84c4e5c20065-windows.jpg',0,2,'2026-03-04 09:39:52'),(65,30,'https://minio.s3.santhira.com/images/images/1a246c9c-e91c-4c1b-b7c4-153262365a30-wal2.jpg',1,0,'2026-03-05 05:33:53'),(66,30,'https://minio.s3.santhira.com/images/images/07b05b5e-621c-41a1-8ed1-25e9ce8c3136-windows - Copy.jpg',0,1,'2026-03-05 05:33:53'),(67,30,'https://minio.s3.santhira.com/images/images/5d51d7e5-8b28-4fe5-ad4c-fbe6977fe016-windows.jpg',0,2,'2026-03-05 05:33:53');
/*!40000 ALTER TABLE `property_images` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `property_types`
--

DROP TABLE IF EXISTS `property_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `property_types` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `description` text,
  `icon` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `property_types`
--

LOCK TABLES `property_types` WRITE;
/*!40000 ALTER TABLE `property_types` DISABLE KEYS */;
INSERT INTO `property_types` VALUES (1,'Apartment','Residential apartment in a building','building','2025-12-16 16:10:19'),(2,'Villa','Independent luxury house','home','2025-12-16 16:10:19'),(3,'House','Independent residential house','house','2025-12-16 16:10:19'),(4,'Plot','Land plot for construction','map','2025-12-16 16:10:19'),(5,'Commercial','Commercial property for business','briefcase','2025-12-16 16:10:19'),(6,'Office Space','Office space in commercial building','building-2','2025-12-16 16:10:19'),(7,'Shop','Retail shop space','store','2025-12-16 16:10:19'),(8,'Penthouse','Luxury penthouse apartment','crown','2025-12-16 16:10:19');
/*!40000 ALTER TABLE `property_types` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `subscription_payments`
--

DROP TABLE IF EXISTS `subscription_payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `subscription_payments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `plan_id` int NOT NULL,
  `subscription_id` int DEFAULT NULL,
  `razorpay_order_id` varchar(100) NOT NULL,
  `razorpay_payment_id` varchar(100) NOT NULL,
  `amount_paise` int NOT NULL,
  `currency` varchar(10) NOT NULL DEFAULT 'INR',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_subscription_payments_razorpay_payment_id` (`razorpay_payment_id`),
  KEY `idx_subscription_payments_user_id` (`user_id`),
  KEY `idx_subscription_payments_plan_id` (`plan_id`),
  KEY `idx_subscription_payments_subscription_id` (`subscription_id`),
  CONSTRAINT `subscription_payments_plan_fk` FOREIGN KEY (`plan_id`) REFERENCES `subscription_plans` (`id`),
  CONSTRAINT `subscription_payments_subscription_fk` FOREIGN KEY (`subscription_id`) REFERENCES `user_subscriptions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `subscription_payments_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `subscription_payments`
--

LOCK TABLES `subscription_payments` WRITE;
/*!40000 ALTER TABLE `subscription_payments` DISABLE KEYS */;
INSERT INTO `subscription_payments` VALUES (1,2,6,2,'order_SN6tlgiD9035iK','pay_SN6uTqBObyxRUT',29900,'INR','2026-03-04 10:09:59'),(2,2,6,4,'order_SN7N4CZu7mYuYV','pay_SN7NCNQsKGuiGj',29900,'INR','2026-03-04 10:37:11'),(3,2,6,5,'order_SN8WESvdQ6u6vG','pay_SN8WeHVUd25jng',29900,'INR','2026-03-04 11:44:49'),(4,2,6,6,'order_SN8Z9GbXjYPqKN','pay_SN8aIfdkMSaMyR',29900,'INR','2026-03-04 11:48:17');
/*!40000 ALTER TABLE `subscription_payments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `subscription_plans`
--

DROP TABLE IF EXISTS `subscription_plans`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `subscription_plans` (
  `id` int NOT NULL AUTO_INCREMENT,
  `role` enum('customer','dealer') COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `price` int NOT NULL,
  `contacts` int DEFAULT '0',
  `validity_days` int NOT NULL,
  `is_premium` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `razorpay_plan_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `subscription_plans`
--

LOCK TABLES `subscription_plans` WRITE;
/*!40000 ALTER TABLE `subscription_plans` DISABLE KEYS */;
INSERT INTO `subscription_plans` VALUES (6,'customer','Elite',299,5,10,0,'2026-02-24 07:26:41',''),(7,'customer','Super Elite',499,10,15,0,'2026-02-24 07:26:41','plan_SJwibO57Ko2KvR'),(8,'customer','Premium',0,999,15,1,'2026-02-24 07:26:41',''),(9,'dealer','Dealer Elite',499,0,30,0,'2026-02-24 07:26:41',''),(10,'dealer','Dealer Super Elite',999,0,30,0,'2026-02-24 07:26:41','');
/*!40000 ALTER TABLE `subscription_plans` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_subscriptions`
--

DROP TABLE IF EXISTS `user_subscriptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_subscriptions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `plan_id` int NOT NULL,
  `contacts_remaining` int DEFAULT '0',
  `expires_at` datetime NOT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `plan_id` (`plan_id`),
  CONSTRAINT `user_subscriptions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_subscriptions_ibfk_2` FOREIGN KEY (`plan_id`) REFERENCES `subscription_plans` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_subscriptions`
--

LOCK TABLES `user_subscriptions` WRITE;
/*!40000 ALTER TABLE `user_subscriptions` DISABLE KEYS */;
INSERT INTO `user_subscriptions` VALUES (2,2,6,5,'2026-03-14 10:09:59',0,'2026-03-04 10:09:59'),(3,2,8,999,'2026-03-19 10:33:20',0,'2026-03-04 10:33:20'),(4,2,6,5,'2026-03-14 10:37:11',0,'2026-03-04 10:37:11'),(5,2,6,5,'2026-03-14 11:44:49',0,'2026-03-04 11:44:49'),(6,2,6,5,'2026-03-14 11:48:17',1,'2026-03-04 11:48:17');
/*!40000 ALTER TABLE `user_subscriptions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `phone` varchar(20) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `full_name` varchar(100) NOT NULL,
  `role` enum('admin','customer','owner','dealer') DEFAULT 'customer',
  `is_verified` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `posts_count` int DEFAULT '0',
  `profile_image` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `phone` (`phone`),
  KEY `idx_phone` (`phone`),
  KEY `idx_role` (`role`)
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (2,'6374777455',NULL,'Super Admin','admin',1,'2025-12-17 03:27:42','2026-03-03 06:31:26',0,NULL),(20,'7449242770',NULL,'jero','dealer',1,'2026-02-27 05:51:59','2026-02-27 05:51:59',0,NULL),(22,'9080285866','projectecom30@gmail.com','gokul','customer',1,'2026-03-04 12:13:24','2026-03-04 12:13:24',0,NULL);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping routines for database 'real_estate_platform'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-03-05 13:28:10
