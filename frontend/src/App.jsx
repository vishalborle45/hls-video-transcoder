import { useState, useEffect, useRef } from "react";
import Hls from "hls.js";
import axios from "axios";

function App() {
  const API_BASE = "http://localhost:4000";

  // Upload state
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Video list state
  const [videos, setVideos] = useState([]);

  // Player state
  const [activeVideo, setActiveVideo] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);

  // Quality selection state
  const [levels, setLevels] = useState([]);
  const [currentLevel, setCurrentLevel] = useState(-1); // -1 = auto

  // Refs
  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  /** Cleanup HLS instance **/
  const cleanupHls = () => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  };

  /** Fetch videos from backend **/
  const fetchVideos = async () => {
    try {
      const res = await axios.get(`${API_BASE}/videos`);
      setVideos(res.data);
    } catch (err) {
      console.error("❌ Failed to fetch videos", err);
    }
  };

  /** Handle file upload **/
  /** Handle file upload **/
const handleUpload = async () => {
  if (!file || !title.trim()) {
    alert("Please select a file and enter a title.");
    return;
  }

  try {
    setIsUploading(true);
    setUploadProgress(0);
    setStatus("Requesting upload URL...");

    const safeFileName = file.name.replace(/\s+/g, "_");
    const key = `videos/${Date.now()}-${safeFileName}`;

    // Step 1: Get signed upload URL from backend
    const { data: uploadData } = await axios.post(
      "http://localhost:3000/upload",
      { key, title },
      { headers: { "Content-Type": "application/json" } }
    );

    setStatus("Uploading to S3...");

    // Step 2: Upload file to S3
    await axios.put(uploadData.uploadUrl, file, {
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
      onUploadProgress: (e) => {
        if (e.total) {
          const percent = Math.round((e.loaded * 100) / e.total);
          setUploadProgress(percent);
        }
      },
    });

    setStatus("Processing video...");

    // Step 3: Notify backend to process the uploaded file
    await axios.post(
      `${"http://localhost:3000"}/queue-job`,
      { videoId: uploadData.videoId, key },
      { headers: { "Content-Type": "application/json" } }
    );

    setStatus("✅ Upload complete!");
    setFile(null);
    setTitle("");
    setUploadProgress(0);
    fetchVideos();
  } catch (err) {
    console.error("❌ Upload failed", err);
    const msg =
      err.response?.data?.message ||
      err.message ||
      "Unknown error occurred while uploading";
    setStatus(`❌ Upload failed: ${msg}`);
  } finally {
    setIsUploading(false);
  }
};


  /** Play video with HLS **/
  const playVideo = async (video) => {
    setActiveVideo(video);
    setIsModalOpen(true);
    setIsVideoLoading(true);
    setLevels([]);
    setCurrentLevel(-1);
    cleanupHls();

    try {
      const res = await axios.get(`${API_BASE}/videos/${video.id}/master`, {
        responseType: "text",
      });
      const masterText = res.data;

      // Create blob URL from playlist text returned by backend
      const blobUrl = URL.createObjectURL(
        new Blob([masterText], { type: "application/vnd.apple.mpegurl" })
      );

      if (videoRef.current) {
        if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
          videoRef.current.src = blobUrl;
          await videoRef.current.play().catch(() => {});
          setIsVideoLoading(false);
        } else if (Hls.isSupported()) {
          const hls = new Hls();
          hlsRef.current = hls;
          hls.loadSource(blobUrl);
          hls.attachMedia(videoRef.current);

          hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
            setLevels(data.levels);
            setIsVideoLoading(false);
            videoRef.current.play().catch(() => {});
          });

          hls.on(Hls.Events.ERROR, (_, data) => {
            console.error("HLS Error", data);
            if (data.fatal) {
              alert("Error loading video");
              cleanupHls();
              setIsVideoLoading(false);
            }
          });
        } else {
          alert("HLS not supported in this browser");
          setIsVideoLoading(false);
        }
      }
    } catch (err) {
      console.error("❌ Error playing video", err);
      setIsVideoLoading(false);
    }
  };

  useEffect(() => {
    fetchVideos();
    const interval = setInterval(fetchVideos, 10000);
    return () => {
      clearInterval(interval);
      cleanupHls();
    };
  }, []);

  const changeResolution = (levelIndex) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
      setCurrentLevel(levelIndex);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      {/* Upload Section */}
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow p-6 mb-6">
        <h1 className="text-2xl font-bold mb-4">Video Uploader</h1>

        <input
          type="text"
          placeholder="Video title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full p-3 border rounded mb-4"
          disabled={isUploading}
        />

        <input
          type="file"
          accept="video/*"
          onChange={(e) => setFile(e.target.files[0])}
          className="w-full p-3 border rounded mb-4"
          disabled={isUploading}
        />

        {isUploading && (
          <div className="mb-4">
            <div className="bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-sm mt-1">{uploadProgress}%</p>
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={isUploading}
          className="w-full bg-blue-600 text-white p-3 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isUploading ? "Uploading..." : "Upload Video"}
        </button>

        {status && <p className="mt-3 text-sm">{status}</p>}
      </div>

      {/* Video List */}
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">Videos</h2>
        {videos.length === 0 ? (
          <p className="text-gray-500">No videos uploaded yet.</p>
        ) : (
          <div className="space-y-3 overflow-auto max-h-124">
  {videos.map((vid) => (
    <div
      key={vid.id}
      className="flex items-center justify-between p-3 border rounded"
    >
      <div>
        <h3 className="font-medium">{vid.title}</h3>
        <span
          className={`text-xs px-2 py-1 rounded ${
            vid.status === "ready"
              ? "bg-green-100 text-green-600"
              : "bg-yellow-100 text-yellow-600"
          }`}
        >
          {vid.status}
        </span>
      </div>
      {vid.status === "ready" && (
        <button
          onClick={() => playVideo(vid)}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Play
        </button>
      )}
    </div>
  ))}
</div>

        )}
      </div>

      {/* Video Modal */}
      {isModalOpen && activeVideo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-lg max-w-4xl w-full mx-4 relative">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold">{activeVideo.title}</h3>
              <button
                onClick={() => {
                  cleanupHls();
                  setIsModalOpen(false);
                  setActiveVideo(null);
                  setIsVideoLoading(false);
                }}
                className="text-red-500 hover:text-red-700"
              >
                ✕
              </button>
            </div>

            {/* Quality Selector */}
            {levels.length > 0 && (
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => changeResolution(-1)}
                  className={`px-3 py-1 rounded ${
                    currentLevel === -1 ? "bg-blue-500 text-white" : "bg-gray-200"
                  }`}
                >
                  Auto
                </button>
                {levels.map((lvl, i) => (
                  <button
                    key={i}
                    onClick={() => changeResolution(i)}
                    className={`px-3 py-1 rounded ${
                      currentLevel === i ? "bg-blue-500 text-white" : "bg-gray-200"
                    }`}
                  >
                    {lvl.height}p
                  </button>
                ))}
              </div>
            )}

            {isVideoLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10">
                <div className="text-white">Loading video...</div>
              </div>
            )}

            <video ref={videoRef} controls className="w-full rounded" />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
