#!/bin/bash
sudo git status
sudo git add .
sudo git status
read -p "Enter commit message: " commit_message
sudo git commit -m "$commit_message"
sudo git push -u origin main
sudo git status