from datetime import datetime, timezone
from types import SimpleNamespace
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch

from app.services import kafka_consumer as worker
from app.services.kafka_producer import KafkaProducerService


class FakeConsumer:
    def __init__(self, message):
        self.message = message
        self.start = AsyncMock()
        self.stop = AsyncMock()
        self.commit = AsyncMock()

    def __aiter__(self):
        async def messages():
            yield self.message
        return messages()


class WorkerReliabilityTests(IsolatedAsyncioTestCase):
    async def test_api_health_checks_broker_and_frame_topic(self):
        service = KafkaProducerService()
        service.ready = True
        service.producer = SimpleNamespace(
            client=SimpleNamespace(force_metadata_update=AsyncMock(return_value=True)),
            partitions_for=AsyncMock(return_value={0, 1, 2, 3, 4, 5}),
        )
        self.assertTrue(await service.check_broker())
        service.producer.client.force_metadata_update.return_value = False
        self.assertFalse(await service.check_broker())

    async def test_failed_frame_is_retried_before_offset_commit(self):
        timestamp = datetime.now(timezone.utc).isoformat()
        message = SimpleNamespace(
            value={
                "kiosk_id": "test-kiosk",
                "session_id": "1",
                "frame_id": "frame-1",
                "frame_bytes": "00",
                "timestamp": timestamp,
                "accepted_at": timestamp,
            },
            topic="video-frames", partition=0, offset=7, key=b"test-kiosk:1",
        )
        consumer = FakeConsumer(message)
        failed_producer = SimpleNamespace(
            start=AsyncMock(), stop=AsyncMock(), send_and_wait=AsyncMock()
        )
        result = {"face_detected": False}
        with (
            patch.object(worker, "wait_for_db", new=AsyncMock()),
            patch.object(worker, "_load_models"),
            patch.object(worker, "AIOKafkaConsumer", return_value=consumer) as factory,
            patch.object(worker, "AIOKafkaProducer", return_value=failed_producer),
            patch.object(worker, "predict_frame", return_value=result),
            patch.object(worker, "save_frame_to_storage", new=AsyncMock(return_value="/frame.jpg")),
            patch.object(worker, "store_frame_result", new=AsyncMock(side_effect=[RuntimeError("db down"), True])) as store,
            patch.object(worker.asyncio, "sleep", new=AsyncMock()),
            patch.object(worker.FRAMES_FAILED, "inc") as failed,
            patch.object(worker.FRAMES_PROCESSED, "inc") as processed,
        ):
            await worker.start_fer_consumer()

        self.assertFalse(factory.call_args.kwargs["enable_auto_commit"])
        self.assertEqual(store.await_count, 2)
        failed.assert_called_once()
        processed.assert_called_once()
        failed_producer.send_and_wait.assert_not_awaited()
        consumer.commit.assert_awaited_once_with(
            {worker.TopicPartition("video-frames", 0): 8}
        )

    async def test_replayed_frame_is_committed_without_duplicate_count(self):
        timestamp = datetime.now(timezone.utc).isoformat()
        message = SimpleNamespace(
            value={
                "kiosk_id": "test-kiosk", "session_id": "1", "frame_id": "frame-1",
                "frame_bytes": "00", "timestamp": timestamp,
            },
            topic="video-frames", partition=0, offset=7, key=b"test-kiosk:1",
        )
        consumer = FakeConsumer(message)
        failed_producer = SimpleNamespace(
            start=AsyncMock(), stop=AsyncMock(), send_and_wait=AsyncMock()
        )
        with (
            patch.object(worker, "wait_for_db", new=AsyncMock()),
            patch.object(worker, "_load_models"),
            patch.object(worker, "AIOKafkaConsumer", return_value=consumer),
            patch.object(worker, "AIOKafkaProducer", return_value=failed_producer),
            patch.object(worker, "predict_frame", return_value={"face_detected": False}),
            patch.object(worker, "save_frame_to_storage", new=AsyncMock(return_value="/frame.jpg")),
            patch.object(worker, "store_frame_result", new=AsyncMock(return_value=False)),
            patch.object(worker.FRAMES_PROCESSED, "inc") as processed,
        ):
            await worker.start_fer_consumer()

        processed.assert_not_called()
        failed_producer.send_and_wait.assert_not_awaited()
        consumer.commit.assert_awaited_once()

    async def test_unrecoverable_frame_moves_to_failure_topic_before_commit(self):
        timestamp = datetime.now(timezone.utc).isoformat()
        message = SimpleNamespace(
            value={
                "kiosk_id": "test-kiosk", "session_id": "1", "frame_id": "frame-1",
                "frame_bytes": "00", "timestamp": timestamp,
            },
            topic="video-frames", partition=0, offset=7, key=b"test-kiosk:1",
        )
        consumer = FakeConsumer(message)
        failed_producer = SimpleNamespace(
            start=AsyncMock(), stop=AsyncMock(), send_and_wait=AsyncMock()
        )
        with (
            patch.object(worker, "wait_for_db", new=AsyncMock()),
            patch.object(worker, "_load_models"),
            patch.object(worker, "AIOKafkaConsumer", return_value=consumer),
            patch.object(worker, "AIOKafkaProducer", return_value=failed_producer),
            patch.object(worker, "predict_frame", side_effect=ValueError("bad image")),
            patch.object(worker.asyncio, "sleep", new=AsyncMock()),
            patch.object(worker.FRAMES_DEAD_LETTERED, "inc") as dead_lettered,
        ):
            await worker.start_fer_consumer()

        self.assertEqual(failed_producer.send_and_wait.await_count, 1)
        self.assertEqual(failed_producer.send_and_wait.call_args.args[0], "video-frames-failed")
        dead_lettered.assert_called_once()
        consumer.commit.assert_awaited_once()
