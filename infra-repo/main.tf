terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket       = "drift-state-aashi-2026-x7k"
    key          = "drift-demo/terraform.tfstate"
    region       = "ap-south-1"
    use_lockfile = true
  }
}

variable "bucket_name" {
  type = string
}

provider "aws" {
  region = "ap-south-1"
}

resource "aws_s3_bucket" "demo" {
  bucket = var.bucket_name
  tags = {
    Environment = "dev"
    Owner       = "college-project"
  }
}

resource "aws_security_group" "web" {
  name        = "drift-demo-web-sg"
  description = "Demo security group"

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}