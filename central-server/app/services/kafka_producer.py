import os
from aiokafka import AIOKafkaProducer
import json

_kafka_producer = None

def get_kafka_producer():
    return _kafka_producer

def set_kafka_producer(producer):
    global _kafka_producer
    _kafka_producer = producer

class KafkaProducerService:
    def __init__(self):
        self.producer = None
        self.ready = False

    async def start(self):
        bootstrap_servers = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
        self.producer = AIOKafkaProducer(
            bootstrap_servers=bootstrap_servers,
            value_serializer=lambda v: json.dumps(v).encode()
    )
        await self.producer.start()
        self.ready = True

    async def send(self, topic: str, value: dict):
        if not self.ready:
            raise Exception("Kafka producer not ready")
        await self.producer.send(topic, value)

    async def stop(self):
        if self.producer:
            await self.producer.stop()
        self.ready = False

    def is_ready(self):
        return self.ready

def get_kafka_producer():
    global _kafka_producer
    return _kafka_producer

def set_kafka_producer(producer):
    global _kafka_producer
    _kafka_producer = producer