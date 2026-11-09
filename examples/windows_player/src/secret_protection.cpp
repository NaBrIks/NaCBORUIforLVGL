// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "secret_protection.hpp"
#include <windows.h>
#include <wincrypt.h>
#include <vector>
#include <stdexcept>
std::string protect_secret(const std::string &text, bool decrypt)
{
	if(text.size() > 32768) throw std::runtime_error("Secret size limit");

	std::vector<BYTE> bytes;
	if(decrypt)
	{
		DWORD size = 0;
		if(!CryptStringToBinaryA(text.data(), DWORD(text.size()), CRYPT_STRING_BASE64, nullptr, &size, nullptr,
		    nullptr))
			throw std::runtime_error("Invalid encrypted settings");

		bytes.resize(size);
		if(!CryptStringToBinaryA(text.data(), DWORD(text.size()), CRYPT_STRING_BASE64, bytes.data(), &size, nullptr,
		    nullptr))
			throw std::runtime_error("Invalid encrypted settings");
	}
	else bytes.assign(text.begin(), text.end());

	DATA_BLOB in{DWORD(bytes.size()), bytes.data()}, out{};
	const BOOL ok = decrypt ? CryptUnprotectData(&in, nullptr, nullptr, nullptr, nullptr, CRYPTPROTECT_UI_FORBIDDEN,
	        &out) : CryptProtectData(&in, L"NaCBORUIforLVGL assistant", nullptr, nullptr, nullptr,
	        CRYPTPROTECT_UI_FORBIDDEN, &out);
	SecureZeroMemory(bytes.data(), bytes.size()); if(!ok) throw std::runtime_error("Windows DPAPI protection failed");

	std::string result;
	if(decrypt) result.assign(reinterpret_cast<char *>(out.pbData), out.cbData);
	else
	{
		DWORD size = 0;
		CryptBinaryToStringA(out.pbData, out.cbData, CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, nullptr, &size);
		result.resize(size);
		if(!CryptBinaryToStringA(out.pbData, out.cbData, CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, result.data(),
		    &size))
		{
			SecureZeroMemory(out.pbData, out.cbData); LocalFree(out.pbData);
			throw std::runtime_error("Encrypted settings encoding failed");
		}

		result.resize(size); while(!result.empty() && result.back() == 0)
			result.pop_back();
	}

	SecureZeroMemory(out.pbData, out.cbData); LocalFree(out.pbData); return result;
}
