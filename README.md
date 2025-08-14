# 🎥 Video Transcoder Microservices

This project is a **scalable, containerized video transcoding pipeline** built with microservices.  
It includes:
- **Frontend** (UI for uploads & monitoring)
- **Get Service** (Fetches media)
- **Upload Service** (Handles file uploads to storage) return presigned url so that frontned can upload directly to s3
- **Transcoding Service** (Converts videos to HLS format) listend to redis queue for job. fetch the original video from s3 and then trancode
-   hls format create m3u8 maset and ts chumks to stream it 
    the video get transcoded into 144,244,360 720 , 1080 etc resolution and stored backed to s3


All services run together via **Docker Compose** using a custom network.

---

## 📦 Services Overview

| Service              | Description                                        | Ports |
|----------------------|------------------------------------------------    |-------|
| `frontend`           | Web UI for upload & video retrive hls format       | 80    |
| `get-service`        | Fetch media from storage or other sources          | 4000  |
| `upload-service`     | Handles file uploads to storage (e.g., S3)         | 3000  |
| `transcoding-service`| Converts uploaded videos to HLS streams(reids)     | —     |

---

setup the env
AWS USER KEY AND SECRET 
give s3 access to user 
Create bucket
run  redis and postgres localy

run npm i 
npx prisma init
npx prisma migrate dev --name init
npm run dev

