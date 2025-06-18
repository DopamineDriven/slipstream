# t3-chat-clone

Check back for updates... "arn:aws:acm:us-east-1:782904577755:certificate/69191d7e-d71a-4340-95ef-7e760e519bf7"

aws acm describe-certificate \
  --region us-east-1 \
  --certificate-arn "arn:aws:acm:us-east-1:782904577755:certificate/69191d7e-d71a-4340-95ef-7e760e519bf7" \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord' \
  --output json
