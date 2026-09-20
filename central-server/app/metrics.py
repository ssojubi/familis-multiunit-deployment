from prometheus_client import Counter, Gauge, Histogram

FRAMES_ACCEPTED = Counter(
    "familis_frames_accepted_total", "Frames acknowledged by Kafka"
)
FRAMES_PROCESSED = Counter(
    "familis_frames_processed_total", "Frames committed to the database"
)
FRAMES_FAILED = Counter(
    "familis_frames_failed_total", "Frame processing attempt failures"
)
FRAMES_DEAD_LETTERED = Counter(
    "familis_frames_dead_lettered_total",
    "Frames moved to the internal failure topic after repeated failures",
)
FRAME_PROCESSING_SECONDS = Histogram(
    "familis_frame_processing_seconds", "FER processing and storage duration",
    buckets=(0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 60),
)
FRAME_END_TO_END_SECONDS = Histogram(
    "familis_frame_end_to_end_seconds", "Capture to database commit duration",
    buckets=(0.5, 1, 2, 5, 10, 20, 30, 60, 120, 300),
)
FRAME_QUEUE_TO_RESULT_SECONDS = Histogram(
    "familis_frame_queue_to_result_seconds",
    "API acceptance to database commit duration",
    buckets=(0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 30, 60, 120),
)
CONNECTED_KIOSKS = Gauge(
    "familis_connected_kiosks", "Kiosks connected to the central API"
)
INGEST_REQUESTS = Counter(
    "familis_ingest_requests_total", "Frame ingest HTTP requests",
    ["status_class"],
)
INGEST_REQUEST_SECONDS = Histogram(
    "familis_ingest_request_seconds", "Frame ingest request duration",
    buckets=(0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10),
)
